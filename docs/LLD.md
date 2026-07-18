# Low-Level Design — User Payout Management System

## 1. Overview

The system tracks affiliate sales through their lifecycle (`pending` →
`approved` / `rejected`), pays users a 10% advance on pending sales, then
settles the remainder (or claws back the overpayment) once an admin
reconciles each sale. Users withdraw from an accumulated balance, limited to
one withdrawal every 24 hours, with automatic recovery if a withdrawal
later fails.

## 2. Why a ledger instead of a mutable balance column

The most important design decision in this system is that **a user's
balance is never stored directly** — it's derived as the sum of an
append-only `LedgerEntry` table.

A mutable `balance` column on `User` looks simpler, but it means every
credit/debit is a read-modify-write on shared state. Under concurrent
advance-payout jobs, reconciliations, and withdrawal requests, that's a
race condition waiting to happen (two `updateMany` calls both reading
balance=100 and separately writing 100+10) unless every write takes a row
lock, which becomes a throughput bottleneck as the user base grows.

A ledger instead makes every state change an **insert**, not an update.
Two concurrent processes posting entries never conflict with each other —
the balance is always `SUM(amount)`, computed fresh. It also gives a free,
tamper-evident audit trail: for money-movement systems, "why does this
user have ₹68" should always be answerable by listing rows, not by
trusting a counter.

**Trade-off:** computing balance requires an aggregate query instead of an
O(1) column read. At the scale implied by this assignment this is a
non-issue (a `SUM` over an indexed `userId` is fast). If this became a hot
path at real scale, the standard fix is a periodically-refreshed cached
balance with the ledger kept as the source of truth for reconciliation —
not replacing the ledger.

## 3. Entities

```
User
 ├── id, name, email
 └── (balance is derived, not stored)

Brand
 └── id, name

Sale
 ├── id, userId, brandId, status (pending/approved/rejected), earning
 ├── advancePaid (bool), advancePaidAmount, advancePaidAt
 └── reconciledAt

LedgerEntry
 ├── id, userId, type, amount (signed), saleId?, withdrawalId?, createdAt
 └── type ∈ {advance_credit, reconciliation_adjustment,
            withdrawal_debit, failed_payout_credit}

Withdrawal
 ├── id, userId, amount, status (pending/success/failed/rejected/cancelled)
 └── createdAt, settledAt
```

### Entity-relationship

```
User 1───* Sale
User 1───* LedgerEntry
User 1───* Withdrawal
Brand 1───* Sale
Sale 1───* LedgerEntry      (a sale can produce an advance entry AND a
                              reconciliation entry — two rows, same saleId)
Withdrawal 1───* LedgerEntry (a debit on request, and possibly a
                              failed_payout_credit if it later fails)
```

See `prisma/schema.prisma` for the full schema with indexes.

## 4. Core workflows

### 4.1 Advance payout job

1. Query all `Sale` rows where `status = pending AND advancePaid = false`.
2. For each: inside a transaction, conditionally `UPDATE ... WHERE id = ?
   AND advancePaid = false` setting `advancePaid = true`. If this affects
   0 rows, another run already claimed it — skip.
3. If the claim succeeded, insert a `LedgerEntry` of type `advance_credit`
   for 10% of `earning`.

This makes the job **safe to run multiple times or concurrently** — the
exact requirement in the assignment ("must never receive another advance
payout, even if the job runs multiple times"). The conditional update is
the idempotency key, not an in-memory check, so it holds even across
multiple server instances.

### 4.2 Reconciliation

1. Admin calls `POST /admin/sales/:saleId/reconcile { status }`.
2. Inside a transaction, conditionally update `Sale` from `pending` to the
   new status. If the sale isn't `pending` anymore, reject with 409 —
   a sale can only be reconciled once, by design.
3. Compute the adjustment against **the advance actually paid**
   (`sale.advancePaidAmount`, defaulting to 0 if the advance job hadn't
   run yet — this handles the edge case of reconciling before advancing):
   - `approved` → `earning - advancePaid` (usually positive)
   - `rejected` → `-advancePaid` (a clawback; 0 if no advance was paid)
4. Insert a single `reconciliation_adjustment` ledger entry.

### 4.3 Withdrawal + rate limiting

1. `POST /users/:userId/withdrawals { amount }`.
2. Find the user's most recent withdrawal (any status). If it was created
   less than 24h ago, reject with 409.
3. Check `amount <= derived balance`. If not, reject.
4. Create the `Withdrawal` (status `pending`) and a `withdrawal_debit`
   ledger entry in the same transaction (so the money is reserved
   immediately, preventing a double-spend if two withdrawal requests race).

**Design decision — what "counts" for the 24h rule:** the assignment says
"one payout withdrawal every 24 hours" without specifying whether a failed
attempt should count. I chose to rate-limit on *any* withdrawal request,
successful or not, because otherwise a user could spam withdrawal attempts
against a flaky payment provider to bypass the limit. If Faym's product
intent is instead "only successful withdrawals count," the fix is a
one-line change to filter `lastWithdrawal` by `status: 'success'` — I
flagged it here rather than guessing silently.

### 4.4 Failed payout recovery

`PATCH /withdrawals/:id/status { status }` is called by a payment-provider
webhook once the real-world outcome is known.

- Conditionally transitions the withdrawal out of `pending` exactly once
  (duplicate webhook deliveries are a no-op — common in real payment
  integrations, which often retry webhooks).
- If the terminal status is `failed`, `rejected`, or `cancelled`: posts a
  `failed_payout_credit` ledger entry for the same amount, which
  immediately makes it withdrawable again (the derived balance goes back
  up, since the earlier debit is still in the ledger but is now offset).

## 5. API surface

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/sales` | Create a sale (`{ userId, brandName, earning }`) |
| GET | `/api/users/:userId/sales` | List a user's sales |
| POST | `/api/admin/sales/:saleId/reconcile` | Reconcile a sale (`{ status }`) |
| POST | `/api/admin/jobs/advance-payout` | Manually trigger the advance job (normally cron-driven, see `src/jobs`) |
| GET | `/api/users/:userId/balance` | Derived withdrawable balance |
| GET | `/api/users/:userId/ledger` | Full ledger history (audit trail) |
| POST | `/api/users/:userId/withdrawals` | Request a withdrawal |
| PATCH | `/api/withdrawals/:withdrawalId/status` | Settle a withdrawal (webhook) |

## 6. Edge cases considered

- **Advance job re-run / concurrent runs** → conditional update makes it a
  no-op past the first successful claim (4.1).
- **Reconciling a sale twice** (double admin click, retried request) →
  conditional update rejects the second attempt with 409 (4.2).
- **Reconciling a sale that never got an advance** → `advancePaidAmount`
  defaults to 0, so the adjustment is just the full earning or 0, correctly.
- **Two withdrawal requests racing** → the ledger debit is posted in the
  same transaction as the withdrawal creation, so the second request's
  balance check sees the first request's reservation.
- **Duplicate webhook delivery for the same withdrawal outcome** →
  conditional status transition makes the second delivery a safe no-op,
  so the user is never credited back twice for one failure.
- **Floating point rounding on percentages** → all money math is done in
  integer paise internally (`src/core/payoutCalculator.js`) and floored,
  not rounded, so the sum of an advance and its later adjustment can never
  exceed the sale's original earning.


