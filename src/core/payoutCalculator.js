/**
 * Core payout math. Deliberately kept free of DB/framework dependencies so it
 * can be unit tested in isolation and reused by both the advance-payout job
 * and the reconciliation job without duplicating logic.
 *
 * All money is handled in paise (integer) internally to avoid floating point
 * rounding bugs common with percentages on currency. Public functions accept
 * and return rupees (number) for readability, converting at the boundary.
 */

const ADVANCE_PAYOUT_PERCENTAGE = 10; // 10% of earnings

function rupeesToPaise(rupees) {
  return Math.round(rupees * 100);
}

function paiseToRupees(paise) {
  return paise / 100;
}

/**
 * Advance payout = 10% of earnings, floored to the nearest paise.
 * Flooring (not rounding) is a deliberate choice: it guarantees the sum of
 * an advance + its eventual adjustment never exceeds the original earning,
 * which matters when this runs against real money.
 */
function calculateAdvancePayout(earningRupees) {
  const earningPaise = rupeesToPaise(earningRupees);
  const advancePaise = Math.floor(
    (earningPaise * ADVANCE_PAYOUT_PERCENTAGE) / 100
  );
  return paiseToRupees(advancePaise);
}

/**
 * Final adjustment once a sale is reconciled, given how much advance was
 * already paid on it.
 *
 *  - status "approved": user is owed the remainder -> earning - advancePaid (positive)
 *  - status "rejected": user was overpaid by the advance -> -advancePaid (negative)
 *
 * Returns a signed rupee amount to be posted as a single ledger entry.
 */
function calculateReconciliationAdjustment(status, earningRupees, advancePaidRupees) {
  if (status !== "approved" && status !== "rejected") {
    throw new Error(`status must be "approved" or "rejected", got "${status}"`);
  }

  const earningPaise = rupeesToPaise(earningRupees);
  const advancePaise = rupeesToPaise(advancePaidRupees);

  const adjustmentPaise =
    status === "approved" ? earningPaise - advancePaise : -advancePaise;

  return paiseToRupees(adjustmentPaise);
}

module.exports = {
  ADVANCE_PAYOUT_PERCENTAGE,
  calculateAdvancePayout,
  calculateReconciliationAdjustment,
};
