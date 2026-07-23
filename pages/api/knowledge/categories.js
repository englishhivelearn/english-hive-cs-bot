const prisma = require('../../../lib/prisma');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const categories = await prisma.knowledgeCategory.findMany({ orderBy: { name: 'asc' } });
    return res.status(200).json(categories);
  }

  if (req.method === 'POST') {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name wajib diisi' });
    const created = await prisma.knowledgeCategory.create({ data: { name } });
    return res.status(201).json(created);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} tidak diizinkan`);
};
