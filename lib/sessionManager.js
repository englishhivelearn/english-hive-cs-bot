const prisma = require('./prisma');

async function getSession(phone) {
  return prisma.conversationSession.findUnique({ where: { phone } });
}

async function setSession(phone, step, context = {}) {
  return prisma.conversationSession.upsert({
    where: { phone },
    update: { step, context },
    create: { phone, step, context },
  });
}

async function clearSession(phone) {
  return prisma.conversationSession.deleteMany({ where: { phone } });
}

module.exports = { getSession, setSession, clearSession };
