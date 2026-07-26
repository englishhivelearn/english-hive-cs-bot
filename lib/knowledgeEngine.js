const stringSimilarity = require('string-similarity');
const prisma = require('./prisma');

const CONFIDENCE_THRESHOLD = 0.35; // di bawah ini dianggap "tidak yakin" -> handover admin
const MIN_QUERY_LENGTH = 3; // pesan lebih pendek dari ini dianggap terlalu tidak spesifik

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip aksen
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cek apakah keyword muncul sebagai frasa utuh (word-boundary),
// bukan cuma substring liar (mis. "jam" jangan match ke "jamban").
function containsPhrase(query, phrase) {
  if (!phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
  return re.test(query);
}

/**
 * Penalti panjang teks: kalau pesan user JAUH lebih pendek dari keyword
 * yang dibandingkan, skor fuzzy-nya diturunkan drastis. Ini mencegah
 * kasus seperti "ke re" ke-anggap cocok dengan "kelas reguler" cuma
 * karena kebetulan ada kemiripan huruf/bigram sekilas.
 */
function lengthPenalty(query, keyword) {
  const shorter = Math.min(query.length, keyword.length);
  const longer = Math.max(query.length, keyword.length);
  if (longer === 0) return 0;
  return shorter / longer;
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

  // Pesan terlalu pendek (mis. "ke", "re", "oke") -> jangan coba tebak,
  // langsung anggap tidak cukup spesifik.
  if (!query || query.length < MIN_QUERY_LENGTH) {
    return { match: null, confidence: 0 };
  }

  const allKnowledge = await prisma.knowledge.findMany({
    include: { keywords: true, category: true },
  });

  if (allKnowledge.length === 0) return { match: null, confidence: 0 };

  let best = null;
  let bestScore = 0;

  for (const entry of allKnowledge) {
    let bestKeywordScore = 0;

    for (const k of entry.keywords) {
      const normKeyword = normalize(k.keyword);
      if (!normKeyword) continue;

      if (containsPhrase(query, normKeyword)) {
        // Exact phrase match sebagai frasa utuh -> skor tinggi, terpercaya.
        const wordCount = normKeyword.split(' ').length;
        const specificityBonus = Math.min(wordCount * 0.05, 0.2);
        bestKeywordScore = Math.max(bestKeywordScore, 0.75 + specificityBonus);
        continue;
      }

      // Bukan exact phrase -> pakai fuzzy match, TAPI dipenalti berdasarkan
      // rasio panjang teks supaya teks pendek tidak asal nyerempet ke
      // keyword yang jauh lebih panjang/spesifik.
      const fuzzy = stringSimilarity.compareTwoStrings(query, normKeyword);
      const penalty = lengthPenalty(query, normKeyword);
      const adjustedScore = fuzzy * penalty;

      bestKeywordScore = Math.max(bestKeywordScore, adjustedScore);
    }

    const titleScore =
      stringSimilarity.compareTwoStrings(query, normalize(entry.title)) *
      lengthPenalty(query, normalize(entry.title));

    const finalScore = Math.max(bestKeywordScore, titleScore * 0.7);

    if (finalScore > bestScore) {
      bestScore = finalScore;
      best = entry;
    }
  }

  if (bestScore < CONFIDENCE_THRESHOLD) {
    return { match: null, confidence: bestScore };
  }

  return { match: best, confidence: bestScore };
}

module.exports = { findBestAnswer, CONFIDENCE_THRESHOLD, normalize };