# Faym SDE Intern Assignment — User Payout Management System

A low-level design and working implementation of a payout system for
affiliate sales: advance payouts, reconciliation, withdrawal handling, and
failed-payout recovery.

**Full design writeup:** [`docs/LLD.md`](docs/LLD.md) — read this first, it
covers the schema, the key design decision (ledger vs. mutable balance),
each workflow, and edge cases handled.

## Quick check — no setup required

The core payout math is dependency-free and can be verified against the
assignment's own worked example in seconds:

```bash
npm install
npm run demo
```

This reproduces the exact scenario from the assignment (three ₹40 pending
sales → ₹12 advance → reconcile as rejected/approved/approved → ₹68 final
payout) and prints a ✅ if the numbers match.

Unit tests for the same logic:

```bash
npm test
```

## Full setup (with database)

1. Have a Postgres instance available (local, Docker, or a hosted free
   tier like Supabase/Neon).
2. `cp .env.example .env` and set `DATABASE_URL`.
3. Install and migrate:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

4. Run the API:

```bash
npm run dev
```

5. Open `http://localhost:3000` in a browser for a small tester UI —
forms for every endpoint, JSON output, and toast notifications for
success/error. It's served by the same Express server (`public/index.html`),
so there's no separate frontend process and no CORS setup needed.

For a scripted walkthrough of every business rule (idempotency, the 24h
withdrawal limit, failed-payout recovery, double-reconciliation guard),
see [`docs/TESTING.md`](docs/TESTING.md) — same flow, via curl.

6. Or try it via curl directly:

```bash
# Pay advances on the seeded pending sales
curl -X POST localhost:3000/api/admin/jobs/advance-payout

# Check balance (should be ₹12 for the seeded user)
curl localhost:3000/api/users/<userId>/balance

# Reconcile a sale
curl -X POST localhost:3000/api/admin/sales/<saleId>/reconcile \
  -H "Content-Type: application/json" -d '{"status":"approved"}'

# Request a withdrawal
curl -X POST localhost:3000/api/users/<userId>/withdrawals \
  -H "Content-Type: application/json" -d '{"amount":10}'
```

## Project structure

```
src/
  core/                 pure, dependency-free business logic (money math)
  services/             ledger, advance payout job, reconciliation, withdrawals
  controllers/, routes/ Express HTTP layer
  jobs/                 cron-style entrypoint for the advance payout job
public/index.html       manual tester UI (served at http://localhost:3000)
prisma/schema.prisma    DB schema (Postgres)
demo/runDemo.js         standalone script reproducing the assignment's example
docs/LLD.md             full design writeup
docs/TESTING.md         step-by-step end-to-end test checklist
```

## Stack

JavaScript (Node.js), Express, Prisma, PostgreSQL. All money fields use
Prisma's `Decimal` type end to end (never floating point for currency at
the ORM/DB layer), and the core percentage math additionally works in
integer paise internally — see `docs/LLD.md` section 6 for why.

## Browser Testing
A lightweight `index.html` file is included for manual browser-based testing of the APIs with different inputs. It is provided solely for development and demonstration purposes and is not part of the production implementation.
