# Manual End-to-End Test Checklist

Run this once against a real Postgres before submitting, to confirm the
system behaves exactly as designed — not just "looks right" on paper.

## 0. Setup (5 min)

Fastest path: a free Postgres on [Supabase](https://supabase.com) or
[Neon](https://neon.tech) — pooled connection string, no local Docker needed.

```bash
cd faym-payout-system
npm install
cp .env.example .env
# paste your DATABASE_URL into .env
npm run prisma:generate
npm run prisma:migrate     # creates the tables
npm run seed                # creates John Doe with 3 pending ₹40 sales
npm run dev                 # starts the API on :3000
```

Keep this terminal running. Open a second terminal for the commands below.

## 1. Confirm the seed worked

```bash
curl localhost:3000/health
# {"ok":true}
```

Get John Doe's `userId` — easiest via Prisma Studio:

```bash
npx prisma studio
```

Copy his `id` from the `users` table. Use it as `<USER_ID>` below. Also
grab one `sale.id` for step 4 — call it `<SALE_ID>`.

## 2. Advance payout job — should credit ₹12 total (3 × ₹4)

```bash
curl -X POST localhost:3000/api/admin/jobs/advance-payout
```
Expect `processed: 3`, none `skipped`.

```bash
curl localhost:3000/api/users/<USER_ID>/balance
# {"balance":"12"}
```

**Re-run the exact same command.** This is the important check:

```bash
curl -X POST localhost:3000/api/admin/jobs/advance-payout
```
Expect `processed: 0` — proves the idempotency guard works, not just that
it ran once correctly.

## 3. Reconcile the three sales (rejected, approved, approved)

```bash
curl -X POST localhost:3000/api/admin/sales/<SALE_ID>/reconcile \
  -H "Content-Type: application/json" -d '{"status":"rejected"}'
```
Reconcile the other two `sale.id`s as `"approved"`.

```bash
curl localhost:3000/api/users/<USER_ID>/balance
# {"balance":"68"}   <- matches the assignment's worked example
```

**Try reconciling the same sale twice:**
```bash
curl -X POST localhost:3000/api/admin/sales/<SALE_ID>/reconcile \
  -H "Content-Type: application/json" -d '{"status":"approved"}'
```
Expect a `409` with a clear error — proves a sale can't be double-reconciled.

## 4. Withdrawal + 24h rate limit

```bash
curl -X POST localhost:3000/api/users/<USER_ID>/withdrawals \
  -H "Content-Type: application/json" -d '{"amount":20}'
```
Expect `201`, balance drops to ₹48. Copy the returned `id` as `<WD_ID>`.

**Immediately try a second withdrawal:**
```bash
curl -X POST localhost:3000/api/users/<USER_ID>/withdrawals \
  -H "Content-Type: application/json" -d '{"amount":10}'
```
Expect `409` — "one withdrawal every 24 hours."

## 5. Failed payout recovery

```bash
curl -X PATCH localhost:3000/api/withdrawals/<WD_ID>/status \
  -H "Content-Type: application/json" -d '{"status":"failed"}'
```

```bash
curl localhost:3000/api/users/<USER_ID>/balance
# {"balance":"68"}   <- back to 68, the ₹20 was credited back automatically
```

**Re-settle the same withdrawal again** (simulates a duplicate webhook):
```bash
curl -X PATCH localhost:3000/api/withdrawals/<WD_ID>/status \
  -H "Content-Type: application/json" -d '{"status":"failed"}'
```
Expect `alreadySettled: true` and balance still ₹68, not ₹88 — proves the
user isn't credited twice for one failure.

## 6. Full ledger audit trail

```bash
curl localhost:3000/api/users/<USER_ID>/ledger
```
Should show every entry: 3× `advance_credit`, 3× `reconciliation_adjustment`,
1× `withdrawal_debit`, 1× `failed_payout_credit` — and they should sum to 68.

---

If every step above matches, the system is verified against a real
database, not just the in-memory demo. Worth a line in your submission
email: *"Tested end-to-end against Postgres, including idempotency and
race-condition guards."*
