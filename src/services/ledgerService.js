const { Prisma } = require("@prisma/client");
const { prisma } = require("../db");

/**
 * Withdrawable balance = sum of all ledger entries for the user.
 * Kept as a query rather than a cached column so it can never drift out of
 * sync with the entries that justify it. If this becomes a hot path at
 * scale, add a materialized/cached balance with the ledger as the
 * reconciliation source of truth — but start correct, optimize later.
 */
async function getBalance(userId, tx = prisma) {
  const result = await tx.ledgerEntry.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount || new Prisma.Decimal(0);
}

async function postLedgerEntry(tx, params) {
  return tx.ledgerEntry.create({
    data: {
      userId: params.userId,
      type: params.type,
      amount: params.amount,
      saleId: params.saleId,
      withdrawalId: params.withdrawalId,
    },
  });
}

module.exports = { getBalance, postLedgerEntry };
