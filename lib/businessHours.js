// Tambahkan di bagian import atas:
const { isWithinOperatingHours, getOutOfHoursNotice } = require('../lib/businessHours');

// Tambahkan function baru ini SETELAH function processMessage:
async function processMessageWithHoursNotice(phone, rawText) {
  const reply = await processMessage(phone, rawText);

  if (!reply) return reply; // tetap diam kalau memang tidak ada jawaban

  if (!isWithinOperatingHours()) {
    return `${reply}\n\n${getOutOfHoursNotice()}`;
  }

  return reply;
}

// Lalu di handler messages.upsert, ganti baris:
const reply = await processMessage(phone, text);
// jadi:
const reply = await processMessageWithHoursNotice(phone, text);