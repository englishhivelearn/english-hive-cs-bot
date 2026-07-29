import { findBestAnswer, CONFIDENCE_THRESHOLD } from '../../lib/knowledgeEngine';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} tidak diizinkan`);
  }

  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message wajib diisi' });
  }

  const { match, confidence } = await findBestAnswer(message);

  return res.status(200).json({
    query: message,
    matched: !!match,
    confidence: Number(confidence.toFixed(3)),
    threshold: CONFIDENCE_THRESHOLD,
    knowledge: match
      ? {
          id: match.id,
          title: match.title,
          content: match.content,
          category: match.category?.name,
          minConfidence: match.minConfidence,
        }
      : null,
  });
}