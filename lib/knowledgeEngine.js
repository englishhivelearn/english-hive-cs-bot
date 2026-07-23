const stringSimilarity = require('string-similarity');
const prisma = require('./prisma');

const CONFIDENCE_THRESHOLD = 0.35; // di bawah ini dianggap "tidak yakin" -> handover admin

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip aksen
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cari jawaban terbaik dari knowledge base berdasarkan kemiripan teks
 * dengan judul, konten, dan keyword yang tersimpan.
 *
 * @param {string} incomingText - pesan mentah dari user
 * @returns {Promise<{ match: object|null, confidence: number }>}
 */
async function findBestAnswer(incomingText) {
  const query = normalize(incomingText);
  if (!query) return { match: null, confidence: 0 };

  const allKnowledge = await prisma.knowledge.findMany({
    include: { keywords: true, category: true },
  });

  if (allKnowledge.length === 0) return { match: null, confidence: 0 };

  let best = null;
  let bestScore = 0;

  for (const entry of allKnowledge) {
    // 1. Cek exact/partial match di keyword dulu (bobot tinggi)
    const keywordScores = entry.keywords.map((k) =>
      stringSimilarity.compareTwoStrings(query, normalize(k.keyword))
    );
    const keywordContains = entry.keywords.some((k) =>
      query.includes(normalize(k.keyword))
    );

    const maxKeywordScore = keywordScores.length ? Math.max(...keywordScores) : 0;

    // 2. Kemiripan terhadap judul & isi (bobot lebih rendah)
    const titleScore = stringSimilarity.compareTwoStrings(query, normalize(entry.title));

    // Kombinasikan skor: keyword exact match menang mutlak
    let score = Math.max(maxKeywordScore, titleScore * 0.7);
    if (keywordContains) score = Math.max(score, 0.9);

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return { match: best, confidence: bestScore };
}

module.exports = { findBestAnswer, CONFIDENCE_THRESHOLD, normalize };
