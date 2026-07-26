import prisma from '../../../../lib/prisma';

export default async function handler(req, res) {
  const id = Number(req.query.id);

  if (req.method === 'PUT') {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name wajib diisi' });
    }

    try {
      const updated = await prisma.knowledgeCategory.update({
        where: { id },
        data: { name: name.trim() },
      });
      return res.status(200).json(updated);
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'Nama kategori sudah dipakai' });
      }
      return res.status(500).json({ error: 'Gagal update kategori' });
    }
  }

  if (req.method === 'DELETE') {
    // Cek dulu apakah kategori ini masih dipakai oleh knowledge lain,
    // supaya tidak menghapus kategori yang masih ada isinya tanpa sadar.
    const usageCount = await prisma.knowledge.count({ where: { categoryId: id } });

    if (usageCount > 0) {
      return res.status(409).json({
        error: `Kategori ini masih dipakai oleh ${usageCount} knowledge. Hapus/pindahkan knowledge itu dulu sebelum hapus kategori.`,
      });
    }

    await prisma.knowledgeCategory.delete({ where: { id } });
    return res.status(204).end();
  }

  res.setHeader('Allow', ['PUT', 'DELETE']);
  return res.status(405).end(`Method ${req.method} tidak diizinkan`);
}