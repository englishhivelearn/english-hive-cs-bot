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
 * yang dibandingkan, skor fuzzy-nya diturunkan drastis.
 */
function lengthPenalty(query, keyword) {
  const shorter = Math.min(query.length, keyword.length);
  const longer = Math.max(query.length, keyword.length);
  if (longer === 0) return 0;
  return shorter / longer;
}

/**
 * Cek apakah SALAH SATU kata di daftar exclude muncul di query.
 * Kalau ya, knowledge ini di-skip total (dianggap tidak relevan),
 * meski keyword/requiredGroups-nya cocok.
 */
function hasExcludedWord(query, excludeKeywords) {
  if (!Array.isArray(excludeKeywords) || excludeKeywords.length === 0) return false;
  return excludeKeywords.some((word) => containsPhrase(query, normalize(word)));
}

/**
 * Cek requiredGroups (AND-logic dalam grup, OR antar-grup).
 * requiredGroups format: [["jadwal","hari"], ["jadwal","jam"]]
 * Match kalau SALAH SATU grup, SEMUA kata di dalamnya muncul di query.
 * @returns {boolean}
 */
function matchesRequiredGroups(query, requiredGroups) {
  if (!Array.isArray(requiredGroups) || requiredGroups.length === 0) return false;

  return requiredGroups.some((group) => {
    if (!Array.isArray(group) || group.length === 0) return false;
    return group.every((term) => containsPhrase(query, normalize(term)));
  });
}

/**
 * Cari jawaban terbaik dari knowledge base.
 *
 * Prioritas skor, dari yang paling terpercaya:
 * 1. Exclude keyword ketemu -> entry ini langsung di-skip (skor 0).
 * 2. Required Groups (AND-logic) cocok -> skor sangat tinggi (0.95),
 *    ini paling presisi karena butuh KOMBINASI kata, bukan cuma 1 kata.
 * 3. Exact phrase match di keyword biasa -> skor tinggi.
 * 4. Fuzzy match dengan penalti panjang teks -> fallback paling longgar.
 *
 * @param {string} incomingText - pesan mentah dari user
 * @returns {Promise<{ match: object|null, confidence: number }>}
 */
async function findBestAnswer(incomingText) {
  const query = normalize(incomingText);

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
    // 1. Cek exclusion dulu -- kalau ada kata terlarang, skip total entry ini.
    if (hasExcludedWord(query, entry.excludeKeywords)) {
      continue;
    }

    let score = 0;

    // 2. Cek Required Groups (AND-logic) -- paling presisi.
    if (matchesRequiredGroups(query, entry.requiredGroups)) {
      score = 0.95;
    }

    // 3. Cek keyword biasa (exact phrase / fuzzy dengan penalti panjang).
    for (const k of entry.keywords) {
      const normKeyword = normalize(k.keyword);
      if (!normKeyword) continue;

      if (containsPhrase(query, normKeyword)) {
        const wordCount = normKeyword.split(' ').length;
        const specificityBonus = Math.min(wordCount * 0.05, 0.2);
        score = Math.max(score, 0.75 + specificityBonus);
        continue;
      }

      const fuzzy = stringSimilarity.compareTwoStrings(query, normKeyword);
      const penalty = lengthPenalty(query, normKeyword);
      score = Math.max(score, fuzzy * penalty);
    }

    // 4. Fallback: kemiripan judul.
    const titleScore =
      stringSimilarity.compareTwoStrings(query, normalize(entry.title)) *
      lengthPenalty(query, normalize(entry.title));
    score = Math.max(score, titleScore * 0.7);

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (bestScore < CONFIDENCE_THRESHOLD) {
    return { match: null, confidence: bestScore };
  }

  return { match: best, confidence: bestScore };
}

module.exports = { findBestAnswer, CONFIDENCE_THRESHOLD, normalize };