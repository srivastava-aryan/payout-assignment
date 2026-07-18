const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const brand = await prisma.brand.upsert({
    where: { name: "brand_1" },
    update: {},
    create: { name: "brand_1" },
  });
  await prisma.brand.upsert({
    where: { name: "brand_2" },
    update: {},
    create: { name: "brand_2" },
  });
  await prisma.brand.upsert({
    where: { name: "brand_3" },
    update: {},
    create: { name: "brand_3" },
  });

  const user = await prisma.user.upsert({
    where: { email: "john_doe@example.com" },
    update: {},
    create: { name: "John Doe", email: "john_doe@example.com" },
  });

  // The three ₹40 pending sales from the assignment's worked example.
  await prisma.sale.createMany({
    data: [
      { userId: user.id, brandId: brand.id, earning: 40, status: "pending" },
      { userId: user.id, brandId: brand.id, earning: 40, status: "pending" },
      { userId: user.id, brandId: brand.id, earning: 40, status: "pending" },
    ],
  });

  console.log(`Seeded user ${user.id} with 3 pending sales of ₹40 each.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
