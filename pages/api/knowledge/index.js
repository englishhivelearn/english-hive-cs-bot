import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const data = await prisma.knowledge.findMany({
      include: { category: true, keywords: true },
      orderBy: { updatedAt: 'desc' },
    });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const {
      title,
      content,
      categoryId,
      keywords = [],
      requiredGroups = [],
      excludeKeywords = [],
    } = req.body;

    if (!title || !content || !categoryId) {
      return res.status(400).json({ error: 'title, content, categoryId wajib diisi' });
    }

    const created = await prisma.knowledge.create({
      data: {
        title,
        content,
        categoryId: Number(categoryId),
        requiredGroups: requiredGroups.length ? requiredGroups : null,
        excludeKeywords: excludeKeywords.length ? excludeKeywords : null,
        keywords: {
          create: keywords
            .filter((k) => k && k.trim())
            .map((k) => ({ keyword: k.trim().toLowerCase() })),
        },
      },
      include: { keywords: true, category: true },
    });

    return res.status(201).json(created);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} tidak diizinkan`);
}