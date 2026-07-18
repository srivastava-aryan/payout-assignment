const { Router } = require("express");
const { createSale, listUserSales } = require("../controllers/salesController");
const {
  reconcile,
  triggerAdvancePayoutJob,
} = require("../controllers/adminController");
const {
  getUserBalance,
  getUserLedger,
} = require("../controllers/payoutController");
const {
  requestWithdrawal,
  updateWithdrawalStatus,
} = require("../controllers/withdrawalController");

const router = Router();

// Sales
router.post("/sales", createSale);
router.get("/users/:userId/sales", listUserSales);

// Admin / reconciliation
router.post("/admin/sales/:saleId/reconcile", reconcile);
router.post("/admin/jobs/advance-payout", triggerAdvancePayoutJob);

// Balance / ledger
router.get("/users/:userId/balance", getUserBalance);
router.get("/users/:userId/ledger", getUserLedger);

// Withdrawals
router.post("/users/:userId/withdrawals", requestWithdrawal);
router.patch("/withdrawals/:withdrawalId/status", updateWithdrawalStatus);

module.exports = { router };
