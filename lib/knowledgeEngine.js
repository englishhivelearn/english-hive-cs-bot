const stringSimilarity = require('string-similarity');
const prisma = require('./prisma');

const CONFIDENCE_THRESHOLD = 0.35;
const MIN_QUERY_LENGTH = 3;
const POPULARITY_BONUS_CAP = 0.06; // bonus maksimal dari popularitas, kecil sengaja -- cuma tie-breaker, bukan penentu utama

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(query, phrase) {
  if (!phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
  return re.test(query);
}

function lengthPenalty(query, keyword) {
  const shorter = Math.min(query.length, keyword.length);
  const longer = Math.max(query.length, keyword.length);
  if (longer === 0) return 0;
  return shorter / longer;
}

function hasExcludedWord(query, excludeKeywords) {
  if (!Array.isArray(excludeKeywords) || excludeKeywords.length === 0) return false;
  return excludeKeywords.some((word) => containsPhrase(query, normalize(word)));
}

function matchesRequiredGroups(query, requiredGroups) {
  if (!Array.isArray(requiredGroups) || requiredGroups.length === 0) return false;
  return requiredGroups.some((group) => {
    if (!Array.isArray(group) || group.length === 0) return false;
    return group.every((term) => containsPhrase(query, normalize(term)));
  });
}

/**
 * Bonus popularitas berbasis log-scale, supaya knowledge yang sudah
 * ribuan kali dipilih tidak "mendominasi mutlak" dibanding yang baru
 * beberapa kali -- cukup jadi tie-breaker halus.
 */
function popularityBonus(matchCount) {
  if (!matchCount || matchCount <= 0) return 0;
  return Math.min(Math.log10(matchCount + 1) * 0.02, POPULARITY_BONUS_CAP);
}

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
    if (hasExcludedWord(query, entry.excludeKeywords)) {
      continue;
    }

    let score = 0;

    if (matchesRequiredGroups(query, entry.requiredGroups)) {
      score = 0.95;
    }

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

    const titleScore =
      stringSimilarity.compareTwoStrings(query, normalize(entry.title)) *
      lengthPenalty(query, normalize(entry.title));
    score = Math.max(score, titleScore * 0.7);

    // Tambah bonus popularitas HANYA kalau entry ini sudah lolos
    // threshold dasar dari matching biasa (bukan penentu utama).
    if (score >= CONFIDENCE_THRESHOLD) {
      score += popularityBonus(entry.matchCount);
    }

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

/**
 * Catat kalau sebuah knowledge "menang" terpilih sebagai jawaban --
 * dipakai untuk popularity bonus di masa depan. Jalan di background,
 * tidak perlu ditunggu (fire-and-forget), supaya tidak nambah latency
 * balasan bot.
 */
function recordMatchUsage(knowledgeId) {
  prisma.knowledge
    .update({ where: { id: knowledgeId }, data: { matchCount: { increment: 1 } } })
    .catch((err) => console.error('Gagal update matchCount:', err.message));
}

/**
 * Catat pertanyaan yang GAGAL dijawab (tidak match / ambigu / confidence
 * rendah), supaya admin bisa review di dashboard dan tahu knowledge apa
 * yang perlu ditambah berdasarkan data pemakaian nyata.
 */
function recordUnansweredQuery(phone, message, reason) {
  prisma.unansweredQuery
    .create({ data: { phone, message, reason } })
    .catch((err) => console.error('Gagal simpan unanswered query:', err.message));
}

module.exports = {
  findBestAnswer,
  CONFIDENCE_THRESHOLD,
  normalize,
  recordMatchUsage,
  recordUnansweredQuery,
};