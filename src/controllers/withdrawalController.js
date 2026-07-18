const {
  initiateWithdrawal,
  settleWithdrawal,
  WithdrawalError,
} = require("../services/withdrawalService");

async function requestWithdrawal(req, res) {
  const { amount } = req.body;
  if (typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  try {
    const withdrawal = await initiateWithdrawal(req.params.userId, amount);
    res.status(201).json(withdrawal);
  } catch (err) {
    if (err instanceof WithdrawalError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

// Called by a payment-provider webhook (or an admin/ops tool) once the
// withdrawal's real-world terminal state is known.
async function updateWithdrawalStatus(req, res) {
  const { status } = req.body;
  if (!["success", "failed", "rejected", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }

  const result = await settleWithdrawal(req.params.withdrawalId, status);
  res.json(result);
}

module.exports = { requestWithdrawal, updateWithdrawalStatus };
