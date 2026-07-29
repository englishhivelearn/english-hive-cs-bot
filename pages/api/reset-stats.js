import prisma from '../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} tidak diizinkan`);
  }

  const { target } = req.body; // 'matchCount' | 'unanswered' | 'all'

  if (target === 'matchCount' || target === 'all') {
    await prisma.knowledge.updateMany({ data: { matchCount: 0 } });
  }

  if (target === 'unanswered' || target === 'all') {
    await prisma.unansweredQuery.deleteMany({});
  }

  return res.status(200).json({ success: true, target });
}