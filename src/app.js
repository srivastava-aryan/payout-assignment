const express = require("express");
const { router } = require("./routes");

const app = express();

app.use(express.json());
app.use("/api", router);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Centralized error handler. Using Express 5 here, which automatically
// forwards rejected promises from async route handlers to this middleware —
// controllers can just `throw` on unexpected errors without manual try/catch.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = { app };
