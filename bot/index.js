const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const { getSession } = require('../lib/sessionManager');
const { isFlowTrigger, startFlow, continueFlow } = require('../lib/conversationFlow');
const { findBestAnswer, CONFIDENCE_THRESHOLD } = require('../lib/knowledgeEngine');

// PENTING: arahkan folder ini ke Railway Volume (lihat README) supaya
// sesi login WhatsApp tidak hilang setiap kali service di-redeploy.
const AUTH_FOLDER = process.env.BAILEYS_AUTH_DIR || './auth_info';

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
      console.log('Scan QR ini dengan WhatsApp (Linked Devices):');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus, reconnect:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp English Hive tersambung!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const phone = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';

    if (!text) return;

    try {
      const reply = await processMessage(phone, text);
      if (reply) {
        await sock.sendMessage(phone, { text: reply });
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
    return (
      'Maaf, saya belum menemukan jawaban yang pas untuk pertanyaan itu. ' +
      'Pesan kamu sudah kami teruskan ke admin, mohon ditunggu ya 🙏\n\n' +
      '(Ketik "trial" untuk daftar trial class gratis)'
    );
  }

  return match.content;
}

startBot();

module.exports = { startBot, processMessage };