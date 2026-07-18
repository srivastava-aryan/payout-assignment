/**
 * Scheduled entrypoint for the advance payout job. In production wire this
 * to a cron trigger (e.g. every 15 min) via node-cron, a serverless
 * scheduled function, or a queue consumer — deliberately NOT an HTTP route,
 * so it can't be triggered arbitrarily by clients. It is idempotent by
 * construction (see advancePayoutService), so overlapping/duplicate runs
 * are always safe.
 *
 * Run manually with: node src/jobs/advancePayoutJob.js
 */
const { runAdvancePayoutJob } = require("../services/advancePayoutService");

runAdvancePayoutJob()
  .then((results) => {
    console.log(`Advance payout job processed ${results.length} sale(s)`);
    console.table(results);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Advance payout job failed:", err);
    process.exit(1);
  });
