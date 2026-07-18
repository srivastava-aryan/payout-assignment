const { reconcileSale, ReconciliationError } = require("../services/reconciliationService");
const { runAdvancePayoutJob } = require("../services/advancePayoutService");

async function reconcile(req, res) {
  const { status } = req.body;
  if (status !== "approved" && status !== "rejected") {
    return res
      .status(400)
      .json({ error: 'status must be "approved" or "rejected"' });
  }

  try {
    const result = await reconcileSale(req.params.saleId, status);
    res.json(result);
  } catch (err) {
    if (err instanceof ReconciliationError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

// In production this is invoked by a cron/scheduler (see src/jobs), not an
// HTTP route. Exposed here too so it can be reviewed/tested via curl/Postman.
async function triggerAdvancePayoutJob(_req, res) {
  const results = await runAdvancePayoutJob();
  res.json({ processed: results.length, results });
}

module.exports = { reconcile, triggerAdvancePayoutJob };
