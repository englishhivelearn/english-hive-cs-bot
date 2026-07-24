import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  const id = Number(req.query.id);

  if (req.method === 'GET') {
    const item = await prisma.knowledge.findUnique({
      where: { id },
      include: { category: true, keywords: true },
    });
    if (!item) return res.status(404).json({ error: 'Tidak ditemukan' });
    return res.status(200).json(item);
  }

  if (req.method === 'PUT') {
    const { title, content, categoryId, keywords = [] } = req.body;

    await prisma.knowledgeKeyword.deleteMany({ where: { knowledgeId: id } });

    const updated = await prisma.knowledge.update({
      where: { id },
      data: {
        title,
        content,
        categoryId: Number(categoryId),
        keywords: {
          create: keywords
            .filter((k) => k && k.trim())
            .map((k) => ({ keyword: k.trim().toLowerCase() })),
        },
      },
      include: { keywords: true, category: true },
    });

    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    await prisma.knowledge.delete({ where: { id } });
    return res.status(204).end();
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).end(`Method ${req.method} tidak diizinkan`);
}