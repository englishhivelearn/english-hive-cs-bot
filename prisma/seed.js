const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const umum = await prisma.knowledgeCategory.upsert({
    where: { name: 'Umum' },
    update: {},
    create: { name: 'Umum' },
  });

  const jadwal = await prisma.knowledgeCategory.upsert({
    where: { name: 'Jadwal' },
    update: {},
    create: { name: 'Jadwal' },
  });

  const k1 = await prisma.knowledge.create({
    data: {
      categoryId: umum.id,
      title: 'Jam Operasional',
      content: 'English Hive buka setiap Senin-Sabtu pukul 09.00 - 20.00. Minggu libur.',
      keywords: {
        create: [
          { keyword: 'jam buka' },
          { keyword: 'jam operasional' },
          { keyword: 'buka jam berapa' },
        ],
      },
    },
  });

  const k2 = await prisma.knowledge.create({
    data: {
      categoryId: jadwal.id,
      title: 'Trial Class',
      content: 'Trial class gratis untuk 1x pertemuan. Silakan ketik "trial" untuk memulai pendaftaran.',
      keywords: {
        create: [
          { keyword: 'trial' },
          { keyword: 'coba kelas' },
          { keyword: 'trial class' },
        ],
      },
    },
  });

  console.log('Seed selesai:', { k1: k1.title, k2: k2.title });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
