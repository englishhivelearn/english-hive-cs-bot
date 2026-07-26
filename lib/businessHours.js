// Jam operasional English Hive: Senin–Sabtu, 11.00–20.00 WITA.
// Minggu & hari libur nasional dianggap tutup total.
const OPEN_HOUR = 11;
const CLOSE_HOUR = 20;
const TIMEZONE = 'Asia/Makassar'; // WITA (UTC+8)

/**
 * Cek apakah sekarang masih dalam jam operasional.
 * @returns {boolean}
 */
function isWithinOperatingHours() {
  const now = new Date();

  // Ambil jam & hari dalam timezone WITA, terlepas dari timezone server.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const weekday = parts.find((p) => p.type === 'weekday').value; // "Sun", "Mon", dst.

  if (weekday === 'Sun') return false; // Minggu tutup

  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

/**
 * Pesan pemberitahuan kalau pesan masuk di luar jam operasional.
 */
function getOutOfHoursNotice() {
  return (
    `⏰ *Di luar jam operasional*\n` +
    `Saat ini di luar jam kerja admin (${OPEN_HOUR}.00–${CLOSE_HOUR}.00 WITA, Senin–Sabtu). ` +
    `Pesan kamu tetap kami terima dan admin akan membalas secepatnya begitu jam kerja dimulai lagi 🙏`
  );
}

module.exports = { isWithinOperatingHours, getOutOfHoursNotice };