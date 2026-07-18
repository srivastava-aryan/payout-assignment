const { PrismaClient } = require("@prisma/client");

// Standard Express-friendly singleton so hot-reload / repeated requires
// don't exhaust the Postgres connection pool.
const prisma = global.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

module.exports = { prisma };
