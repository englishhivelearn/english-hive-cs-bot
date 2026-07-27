const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const http = require('http');

const { findBestAnswer, CONFIDENCE_THRESHOLD } = require('../lib/knowledgeEngine');
const { isWithinOperatingHours, getOutOfHoursNotice } = require('../lib/businessHours');

// PENTING: arahkan folder ini ke Railway Volume (lihat README) supaya
// sesi login WhatsApp tidak hilang setiap kali service di-redeploy.
const AUTH_FOLDER = process.env.BAILEYS_AUTH_DIR || './auth_info';

// Railway selalu inject PORT otomatis. JANGAN di-override manual di Variables.
const PORT = process.env.PORT || 3000;

let latestQR = null;
let isConnected = false;

// Halaman web khusus untuk menampilkan QR sebagai gambar asli
// (jauh lebih gampang discan daripada ASCII QR di terminal log Railway).
function startQrServer() {
  const server = http.createServer(async (req, res) => {
    if (isConnected) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <html>
          <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f0fdf4">
            <h2 style="color:#166534">✅ Bot WhatsApp sudah tersambung. Tidak perlu scan QR lagi.</h2>
          </body>
        </html>
      `);
    }

    if (!latestQR) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <html>
          <head><meta http-equiv="refresh" content="5"></head>
          <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">
            <h2>Menyiapkan QR code... halaman ini auto-refresh tiap 5 detik.</h2>
          </body>
        </html>
      `);
    }

    try {
      const qrImage = await QRCode.toDataURL(latestQR, { width: 400, margin: 2 });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <head>
            <meta http-equiv="refresh" content="20">
            <title>Scan QR - English Hive Bot</title>
          </head>
          <body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;margin-top:40px;background:#fafafa">
            <h2>Scan QR ini dengan WhatsApp</h2>
            <p>Setelan → Perangkat Tertaut → Tautkan Perangkat</p>
            <img src="${qrImage}" width="400" height="400" style="border:8px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.1);border-radius:8px" />
            <p style="color:#666;margin-top:16px">Halaman auto-refresh tiap 20 detik selama QR belum discan.</p>
          </body>
        </html>
      `);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Gagal generate QR image: ' + err.message);
    }
  });

  server.on('error', (err) => {
    console.error('❌ QR web server gagal jalan:', err.message);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log('==================================================');
    console.log(`  QR web server AKTIF di port ${PORT}`);
    console.log('  Buka domain publik service ini untuk lihat QR.');
    console.log('==================================================');
  });
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQR = qr;
      isConnected = false;
      console.log('QR code baru diterima. Buka halaman web service ini untuk scan.');
    }

    if (connection === 'close') {
      isConnected = false;
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus, reconnect:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      isConnected = true;
      latestQR = null;
      console.log('✅ Bot WhatsApp English Hive tersambung!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const phone = msg.key.remoteJid;

    // Skip pesan dari grup — JID grup WhatsApp selalu berakhiran "@g.us".
    // Chat pribadi berakhiran "@s.whatsapp.net".
    if (phone.endsWith('@g.us')) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';

    if (!text) return;

    console.log(`📩 Pesan masuk dari ${phone}: "${text}"`);

    try {
      const reply = await processMessageWithHoursNotice(phone, text);
      if (reply) {
        console.log(`📤 Membalas: "${reply.slice(0, 80)}..."`);

        // Gimmick: tunjukkan status "mengetik..." dan tunda 5 detik
        // sebelum benar-benar membalas, biar terasa lebih natural
        // (tidak instan seperti robot).
        await sock.sendPresenceUpdate('composing', phone);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await sock.sendPresenceUpdate('paused', phone);

        await sock.sendMessage(phone, { text: reply });
      } else {
        console.log('⚠️ Tidak ada balasan (reply kosong/null).');
      }
    } catch (err) {
      console.error('Error memproses pesan:', err);
      await sock.sendMessage(phone, {
        text: 'Maaf, terjadi kendala teknis. Admin kami akan segera membantu 🙏',
      });
    }
  });

  return sock;
}

async function processMessage(phone, rawText) {
  const text = rawText.trim();
  if (!text) return null;

  const { match, confidence, ambiguous } = await findBestAnswer(text);

  // Tidak yakin / tidak ketemu / ambigu -> diam sama sekali, tidak kirim apa-apa.
  if (!match || confidence < CONFIDENCE_THRESHOLD || ambiguous) {
    return null;
  }

  return match.content;
}

// Lacak nomor mana saja yang SUDAH dikasih notice jam operasional hari ini,
// supaya tidak dikirim berulang-ulang tiap pesan. Reset otomatis tiap
// ganti hari (key-nya termasuk tanggal).
const notifiedOutOfHours = new Map(); // phone -> "YYYY-MM-DD" (tanggal WITA terakhir dinotif)

function getTodayWITA() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
}

/**
 * Bungkus reply dengan notice jam operasional kalau perlu.
 * Bot tetap otomatis jawab FAQ 24 jam (nilai jual utamanya), tapi
 * user diberi tahu bahwa follow-up manual dari admin baru akan
 * direspon saat jam kerja -- notice ini cuma dikirim SEKALI per nomor
 * per hari, tidak diulang-ulang tiap pesan.
 */
async function processMessageWithHoursNotice(phone, rawText) {
  const reply = await processMessage(phone, rawText);

  if (!reply) return reply; // tetap diam kalau memang tidak ada jawaban

  if (!isWithinOperatingHours()) {
    const today = getTodayWITA();
    const alreadyNotified = notifiedOutOfHours.get(phone) === today;

    if (!alreadyNotified) {
      notifiedOutOfHours.set(phone, today);
      return `${reply}\n\n${getOutOfHoursNotice()}`;
    }
  }

  return reply;
}

startQrServer();
startBot();

module.exports = { startBot, processMessage };