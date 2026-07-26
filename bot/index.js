const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const http = require('http');

const { getSession } = require('../lib/sessionManager');
const { isFlowTrigger, startFlow, continueFlow } = require('../lib/conversationFlow');
const { findBestAnswer, CONFIDENCE_THRESHOLD } = require('../lib/knowledgeEngine');

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
      const reply = await processMessage(phone, text);
      if (reply) {
        console.log(`📤 Membalas: "${reply.slice(0, 80)}..."`);
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

  const session = await getSession(phone);
  if (session && session.step) {
    return continueFlow(phone, session, text);
  }

  const flowName = isFlowTrigger(text);
  if (flowName) {
    return startFlow(phone, flowName);
  }

  const { match, confidence } = await findBestAnswer(text);

  if (!match || confidence < CONFIDENCE_THRESHOLD) {
    // Tidak ada jawaban yang cukup yakin -> bot diam, tidak balas apa-apa.
    return null;
  }

  return match.content;
}

startQrServer();
startBot();

module.exports = { startBot, processMessage };