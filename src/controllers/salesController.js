const { prisma } = require("../db");

async function createSale(req, res) {
  const { userId, brandName, earning } = req.body;
  if (!userId || !brandName || typeof earning !== "number") {
    return res
      .status(400)
      .json({ error: "userId, brandName, and numeric earning are required" });
  }

  const brand = await prisma.brand.upsert({
    where: { name: brandName },
    update: {},
    create: { name: brandName },
  });

  const sale = await prisma.sale.create({
    data: { userId, brandId: brand.id, earning },
  });

  res.status(201).json(sale);
}

async function listUserSales(req, res) {
  const sales = await prisma.sale.findMany({
    where: { userId: req.params.userId },
    include: { brand: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(sales);
}

module.exports = { createSale, listUserSales };
