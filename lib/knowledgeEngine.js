const stringSimilarity = require('string-similarity');
const prisma = require('./prisma');

const DEFAULT_CONFIDENCE_THRESHOLD = 0.35; // dipakai kalau knowledge tidak punya minConfidence sendiri
const CONFIDENCE_THRESHOLD = DEFAULT_CONFIDENCE_THRESHOLD; // export lama, tetap dipertahankan untuk kompatibilitas
const MIN_QUERY_LENGTH = 3;
const POPULARITY_BONUS_CAP = 0.06;

// Kamus singkatan umum bahasa chat Indonesia + istilah spesifik konteks
// kursus, di-expand jadi bentuk lengkapnya SEBELUM matching. Ini yang
// bikin "kls" ketemu keyword "kelas", "gmn jdwl" ketemu "gimana jadwal".
// Tambahkan entri baru di sini kapan saja kalau nemu pola baru dari
// tab "Belum Terjawab" di dashboard.
const ABBREVIATIONS = {
  kls: 'kelas',
  jdwl: 'jadwal',
  jdw: 'jadwal',
  reg: 'reguler',
  priv: 'private',
  byr: 'bayar',
  byrn: 'pembayaran',
  pembyrn: 'pembayaran',
  dftr: 'daftar',
  sklh: 'sekolah',
  lok: 'lokasi',
  almt: 'alamat',
  gmn: 'gimana',
  bgt: 'banget',
  utk: 'untuk',
  yg: 'yang',
  tdk: 'tidak',
  ga: 'tidak',
  gak: 'tidak',
  ngga: 'tidak',
  nggak: 'tidak',
  dgn: 'dengan',
  krn: 'karena',
  jd: 'jadi',
  sy: 'saya',
  gw: 'saya',
  gue: 'saya',
  kk: 'kakak',
  min: 'admin',
  cs: 'admin',
  info: 'informasi',
  tlp: 'telepon',
  wa: 'whatsapp',
  bs: 'bisa',
  bsa: 'bisa',
  udh: 'sudah',
  udah: 'sudah',
  blm: 'belum',
  blom: 'belum',
  trs: 'terus',
  trm: 'terima',
  mkasih: 'terimakasih',
  makasih: 'terimakasih',
  kpn: 'kapan',
  brp: 'berapa',
  dmn: 'dimana',
  spy: 'supaya',
  hrs: 'harus',
  krg: 'kurang',
  lbh: 'lebih',
  skrg: 'sekarang',
  bln: 'bulan',
  thn: 'tahun',
  org: 'orang',
};

function expandAbbreviations(text) {
  return text
    .split(' ')
    .map((word) => ABBREVIATIONS[word] || word)
    .join(' ');
}

// Partikel/kata ganti yang sering nempel di akhir kata bahasa Indonesia
// dan tidak mengubah makna inti kata. Dipotong supaya "jadwalnya" ==
// "jadwal", "adakah" == "ada", dst. "-lah" sengaja TIDAK dimasukkan
// karena banyak kata asli berakhiran itu (mis. "sekolah", "lelah")
// yang akan rusak kalau dipotong naif.
//const SUFFIXES = ['kannya', 'annya', 'nya', 'kah', 'pun', 'ku', 'mu'];
const SUFFIXES = ['nya', 'ny', 'in'];
const MIN_STEM_LENGTH = 3; // jangan potong kalau hasil akhirnya jadi terlalu pendek/ambigu

function stripSuffix(word) {
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= MIN_STEM_LENGTH) {
      return word.slice(0, -suf.length);
    }
  }
  return word;
}

function normalize(text) {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) return base;

  // 1. Expand singkatan dulu (kls -> kelas), baru
  // 2. Stem partikel/akhiran (jadwalnya -> jadwal).
  // Urutan ini penting: singkatan di-expand jadi kata utuh dulu,
  // baru kata utuh itu yang di-strip akhirannya kalau perlu.
  return expandAbbreviations(base)
    .split(' ')
    .map(stripSuffix)
    .join(' ');
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

function popularityBonus(matchCount) {
  if (!matchCount || matchCount <= 0) return 0;
  return Math.min(Math.log10(matchCount + 1) * 0.02, POPULARITY_BONUS_CAP);
}

/**
 * Ambil threshold efektif untuk sebuah knowledge: pakai minConfidence
 * custom-nya kalau diisi, kalau tidak pakai default global.
 */
function getEffectiveThreshold(entry) {
  return typeof entry.minConfidence === 'number' ? entry.minConfidence : DEFAULT_CONFIDENCE_THRESHOLD;
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

    // Cek terhadap threshold KHUSUS entry ini (bukan cuma global) --
    // entry sensitif (mis. minConfidence 0.55) butuh skor lebih
    // meyakinkan sebelum dianggap valid sebagai kandidat.
    const effectiveThreshold = getEffectiveThreshold(entry);
    if (score < effectiveThreshold) {
      continue; // tidak lolos threshold sendiri -> skip, entry lain masih bisa dicoba
    }

    score += popularityBonus(entry.matchCount);

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (!best) {
    return { match: null, confidence: bestScore };
  }

  return { match: best, confidence: bestScore };
}

function recordMatchUsage(knowledgeId) {
  prisma.knowledge
    .update({ where: { id: knowledgeId }, data: { matchCount: { increment: 1 } } })
    .catch((err) => console.error('Gagal update matchCount:', err.message));
}

function recordUnansweredQuery(phone, message, reason) {
  prisma.unansweredQuery
    .create({ data: { phone, message, reason } })
    .catch((err) => console.error('Gagal simpan unanswered query:', err.message));
}

module.exports = {
  findBestAnswer,
  CONFIDENCE_THRESHOLD,
  DEFAULT_CONFIDENCE_THRESHOLD,
  normalize,
  recordMatchUsage,
  recordUnansweredQuery,
};