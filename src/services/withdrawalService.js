const { Prisma } = require("@prisma/client");
const { prisma } = require("../db");
const { getBalance, postLedgerEntry } = require("./ledgerService");

class WithdrawalError extends Error {}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Initiates a withdrawal for a user's full (or partial) available balance.
 *
 * Rate limit: "one withdrawal every 24 hours" is enforced against the most
 * recent withdrawal REQUEST (any status), not just successful ones. This is
 * a deliberate design choice, see docs/LLD.md "Withdrawal rate limit" for
 * the trade-off discussion and how to relax it if the business wants failed
 * attempts to not count against the limit.
 */
async function initiateWithdrawal(userId, amount) {
  return prisma.$transaction(async (tx) => {
    const lastWithdrawal = await tx.withdrawal.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (lastWithdrawal) {
      const elapsed = Date.now() - lastWithdrawal.createdAt.getTime();
      if (elapsed < TWENTY_FOUR_HOURS_MS) {
        const retryAfterMs = TWENTY_FOUR_HOURS_MS - elapsed;
        throw new WithdrawalError(
          `Only one withdrawal allowed every 24 hours. Try again in ${Math.ceil(
            retryAfterMs / (60 * 1000)
          )} minutes.`
        );
      }
    }

    const balance = await getBalance(userId, tx);
    if (new Prisma.Decimal(amount).greaterThan(balance)) {
      throw new WithdrawalError(
        `Requested amount ₹${amount} exceeds available balance ₹${balance.toString()}`
      );
    }

    const withdrawal = await tx.withdrawal.create({
      data: { userId, amount, status: "pending" },
    });

    await postLedgerEntry(tx, {
      userId,
      type: "withdrawal_debit",
      amount: -amount, // negative: money is leaving the withdrawable balance
      withdrawalId: withdrawal.id,
    });

    return withdrawal;
  });
}

/**
 * Called by the payment-provider webhook (or an admin) once a withdrawal's
 * real-world outcome is known.
 *
 * On failed/rejected/cancelled: credits the amount back to the user's
 * withdrawable balance (failed_payout_credit) so they can immediately
 * initiate a new withdrawal for it — this directly implements the
 * "Failed Payout Recovery" requirement in the assignment.
 *
 * Idempotency: only transitions out of "pending" once; a duplicate webhook
 * delivery for the same terminal status is a no-op.
 */
async function settleWithdrawal(withdrawalId, outcome) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.withdrawal.updateMany({
      where: { id: withdrawalId, status: "pending" },
      data: { status: outcome, settledAt: new Date() },
    });

    if (claim.count === 0) {
      // Already settled (or doesn't exist) — safe no-op, protects against
      // duplicate webhook delivery.
      return { withdrawalId, outcome, alreadySettled: true };
    }

    if (outcome !== "success") {
      const withdrawal = await tx.withdrawal.findUniqueOrThrow({
        where: { id: withdrawalId },
      });
      await postLedgerEntry(tx, {
        userId: withdrawal.userId,
        type: "failed_payout_credit",
        amount: withdrawal.amount, // credit it back, positive
        withdrawalId: withdrawal.id,
      });
    }

    return { withdrawalId, outcome, alreadySettled: false };
  });
}

module.exports = { initiateWithdrawal, settleWithdrawal, WithdrawalError };
