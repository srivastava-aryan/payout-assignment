const { prisma } = require("../db");
const { calculateReconciliationAdjustment } = require("../core/payoutCalculator");
const { postLedgerEntry } = require("./ledgerService");

class ReconciliationError extends Error {}

/**
 * Moves a sale from pending -> approved/rejected and posts the final payout
 * adjustment. A sale can only be reconciled once: the update is guarded by
 * a conditional WHERE (status: "pending") inside the transaction, so a
 * duplicate/racing reconciliation call is a no-op rather than double-paying
 * or double-clawing-back the user.
 *
 * Note: reconciliation is defined against whatever advance was actually
 * paid (sale.advancePaidAmount), which correctly handles a sale that was
 * reconciled before the advance job ever ran on it (advancePaidAmount = 0).
 */
async function reconcileSale(saleId, newStatus) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new ReconciliationError("Sale not found");
    if (sale.status !== "pending") {
      throw new ReconciliationError(
        `Sale ${saleId} is already ${sale.status}; cannot reconcile again`
      );
    }

    const claim = await tx.sale.updateMany({
      where: { id: saleId, status: "pending" },
      data: { status: newStatus, reconciledAt: new Date() },
    });
    if (claim.count === 0) {
      // Lost a race to a concurrent reconciliation call — safe no-op.
      throw new ReconciliationError(
        `Sale ${saleId} was reconciled concurrently; skipping`
      );
    }

    const advancePaid = Number(sale.advancePaidAmount || 0);
    const adjustment = calculateReconciliationAdjustment(
      newStatus,
      Number(sale.earning),
      advancePaid
    );

    const entry = await postLedgerEntry(tx, {
      userId: sale.userId,
      type: "reconciliation_adjustment",
      amount: adjustment,
      saleId: sale.id,
    });

    return { saleId, newStatus, adjustment, ledgerEntryId: entry.id };
  });
}

module.exports = { reconcileSale, ReconciliationError };
