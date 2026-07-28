// Jam operasional English Hive: Senin–Sabtu, 11.00–20.00 WITA.
// Minggu & hari libur nasional dianggap tutup total.
const OPEN_HOUR = 11;
const CLOSE_HOUR = 20;

// Jam SUNYI TOTAL: 22.00–07.00 WITA. Di rentang ini bot tidak menjawab
// apapun sama sekali (beda dari "di luar jam operasional" yang masih
// dijawab tapi dikasih notice).
const SILENT_START_HOUR = 22;
const SILENT_END_HOUR = 7;

const TIMEZONE = 'Asia/Makassar'; // WITA (UTC+8)

function getWitaParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const weekday = parts.find((p) => p.type === 'weekday').value; // "Sun", "Mon", dst.
  return { hour, weekday };
}

/**
 * Cek apakah sekarang masuk jam SUNYI TOTAL (22.00–07.00 WITA).
 * Kalau true, bot tidak boleh menjawab apapun sama sekali.
 * @returns {boolean}
 */
function isSilentHours() {
  const { hour } = getWitaParts();
  // Rentang melewati tengah malam: jam >= 22 ATAU jam < 7.
  return hour >= SILENT_START_HOUR || hour < SILENT_END_HOUR;
}

/**
 * Cek apakah sekarang masih dalam jam operasional resmi (11.00–20.00,
 * Senin–Sabtu). Di luar ini tapi masih di luar jam sunyi -> bot tetap
 * jawab tapi dikasih notice bahwa admin belum standby.
 * @returns {boolean}
 */
function isWithinOperatingHours() {
  const { hour, weekday } = getWitaParts();
  if (weekday === 'Sun') return false; // Minggu tutup
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

/**
 * Pesan pemberitahuan kalau pesan masuk di luar jam operasional
 * (tapi masih di luar jam sunyi, jadi tetap dijawab).
 */
function getOutOfHoursNotice() {
  return (
    `⏰ *Di luar jam operasional*\n` +
    `Saat ini di luar jam kerja admin (${OPEN_HOUR}.00–${CLOSE_HOUR}.00 WITA, Senin–Sabtu). ` +
    `Pesan kamu tetap kami terima dan admin akan membalas secepatnya begitu jam kerja dimulai lagi 🙏`
  );
}

module.exports = {
  isWithinOperatingHours,
  getOutOfHoursNotice,
  isSilentHours,
};