const { setSession, clearSession } = require('./sessionManager');

/**
 * Definisi flow bertahap. Tambahkan flow baru di sini
 * (registrasi siswa, cek SPP, dll) mengikuti pola yang sama.
 */
const FLOWS = {
  trial: {
    steps: ['nama', 'level', 'jadwal_pilihan'],
    prompts: {
      nama: 'Baik! Siapa nama lengkap calon peserta trial class?',
      level: 'Level bahasa Inggris saat ini (Beginner / Intermediate / Advanced)?',
      jadwal_pilihan: 'Pilih jadwal trial: Pagi (09.00) / Sore (16.00) / Malam (19.00)?',
    },
    onComplete: async (phone, context) => {
      // TODO: simpan ke tabel pendaftaran trial / kirim notifikasi admin
      return `Terima kasih ${context.nama}! Trial class level ${context.level} pada slot ${context.jadwal_pilihan} sudah kami catat. Admin akan konfirmasi lewat WhatsApp ini ya 🙌`;
    },
  },
};

function isFlowTrigger(text) {
  const t = text.trim().toLowerCase();
  return Object.keys(FLOWS).includes(t) ? t : null;
}

async function startFlow(phone, flowName) {
  const flow = FLOWS[flowName];
  const firstStep = flow.steps[0];
  await setSession(phone, `${flowName}:${firstStep}`, {});
  return flow.prompts[firstStep];
}

async function continueFlow(phone, session, incomingText) {
  const [flowName, currentStep] = session.step.split(':');
  const flow = FLOWS[flowName];
  const context = { ...(session.context || {}), [currentStep]: incomingText.trim() };

  const currentIndex = flow.steps.indexOf(currentStep);
  const nextStep = flow.steps[currentIndex + 1];

  if (!nextStep) {
    const reply = await flow.onComplete(phone, context);
    await clearSession(phone);
    return reply;
  }

  await setSession(phone, `${flowName}:${nextStep}`, context);
  return flow.prompts[nextStep];
}

module.exports = { isFlowTrigger, startFlow, continueFlow, FLOWS };
