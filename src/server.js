const { app } = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Faym payout system listening on port ${PORT}`);
});
