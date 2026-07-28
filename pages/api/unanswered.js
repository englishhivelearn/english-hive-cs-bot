import prisma from '../../lib/prisma';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { resolved } = req.query;
    const where = resolved !== undefined ? { resolved: resolved === 'true' } : {};

    const data = await prisma.unansweredQuery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const { id, resolved } = req.body;
    const updated = await prisma.unansweredQuery.update({
      where: { id: Number(id) },
      data: { resolved: !!resolved },
    });
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    await prisma.unansweredQuery.delete({ where: { id: Number(id) } });
    return res.status(204).end();
  }

  res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
  return res.status(405).end(`Method ${req.method} tidak diizinkan`);
}