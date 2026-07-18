const { getBalance } = require("../services/ledgerService");
const { prisma } = require("../db");

async function getUserBalance(req, res) {
  const balance = await getBalance(req.params.userId);
  res.json({ userId: req.params.userId, balance: balance.toString() });
}

async function getUserLedger(req, res) {
  const entries = await prisma.ledgerEntry.findMany({
    where: { userId: req.params.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(entries);
}

module.exports = { getUserBalance, getUserLedger };
