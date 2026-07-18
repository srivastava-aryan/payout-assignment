/**
 * Standalone, dependency-free demo that reproduces the worked example from
 * the assignment PDF exactly, so correctness can be checked without wiring
 * up Postgres/Prisma first.
 *
 * Run with:  node demo/runDemo.js
 */
const {
  calculateAdvancePayout,
  calculateReconciliationAdjustment,
} = require("../src/core/payoutCalculator");

console.log("=== Step 1: Sales enter as pending ===");
const sales = [
  { userId: "john_doe", brand: "brand_1", status: "pending", earning: 40 },
  { userId: "john_doe", brand: "brand_1", status: "pending", earning: 40 },
  { userId: "john_doe", brand: "brand_1", status: "pending", earning: 40 },
];
console.table(sales);

console.log("\n=== Step 2: Advance payout job runs (10% each, idempotent) ===");
const advances = sales.map((s) => calculateAdvancePayout(s.earning));
const totalAdvance = advances.reduce((a, b) => a + b, 0);
advances.forEach((a, i) =>
  console.log(`Sale ${i + 1}: earning ₹${sales[i].earning} -> advance ₹${a}`)
);
console.log(`Total advance paid: ₹${totalAdvance} (expected ₹12)`);

console.log("\n=== Step 3: Admin reconciles ===");
const reconciledStatuses = ["rejected", "approved", "approved"];
let totalFinalPayout = 0;
reconciledStatuses.forEach((status, i) => {
  const adjustment = calculateReconciliationAdjustment(
    status,
    sales[i].earning,
    advances[i]
  );
  totalFinalPayout += adjustment;
  console.log(
    `Sale ${i + 1}: ${status}, earning ₹${sales[i].earning}, advance ₹${
      advances[i]
    } -> adjustment ${adjustment >= 0 ? "+" : ""}₹${adjustment}`
  );
});

console.log(`\nTotal final payout: ₹${totalFinalPayout} (expected ₹68)`);
console.log(
  totalFinalPayout === 68 ? "✅ Matches assignment example" : "❌ Mismatch"
);
