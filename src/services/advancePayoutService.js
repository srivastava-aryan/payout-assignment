const { prisma } = require("../db");
const { calculateAdvancePayout } = require("../core/payoutCalculator");
const { postLedgerEntry } = require("./ledgerService");

/**
 * Scans pending sales that have not yet received an advance and pays out
 * 10% of earnings on each.
 *
 * Idempotency: the query filters on advancePaid=false, and the update sets
 * advancePaid=true inside the SAME transaction as the ledger write, guarded
 * by a conditional update (updateMany with advancePaid: false in the WHERE)
 * so that even if this job is triggered concurrently or re-run, a sale can
 * never be advanced twice. If the conditional update affects 0 rows, we
 * know another worker already claimed this sale and we skip the ledger
 * write entirely.
 */
async function runAdvancePayoutJob() {
  const eligibleSales = await prisma.sale.findMany({
    where: { status: "pending", advancePaid: false },
    select: { id: true, userId: true, earning: true },
  });

  const results = [];

  for (const sale of eligibleSales) {
    const advance = calculateAdvancePayout(Number(sale.earning));

    const outcome = await prisma.$transaction(async (tx) => {
      // Conditional claim: only proceeds if still un-advanced right now.
      const claim = await tx.sale.updateMany({
        where: { id: sale.id, advancePaid: false },
        data: {
          advancePaid: true,
          advancePaidAmount: advance,
          advancePaidAt: new Date(),
        },
      });

      if (claim.count === 0) {
        // Another run/worker already advanced this sale between our
        // findMany and now. Do nothing — this is what makes reruns safe.
        return { skipped: true };
      }

      await postLedgerEntry(tx, {
        userId: sale.userId,
        type: "advance_credit",
        amount: advance,
        saleId: sale.id,
      });

      return { skipped: false };
    });

    results.push({ saleId: sale.id, advance, skipped: outcome.skipped });
  }

  return results;
}

module.exports = { runAdvancePayoutJob };
