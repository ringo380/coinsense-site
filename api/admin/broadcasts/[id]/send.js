import { Resend } from 'resend';
import { requireAdmin } from '../../_auth.js';

let client;
const getResend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = (req.query?.id || '').toString();
  if (!id) return res.status(400).json({ error: 'id required' });

  const { scheduledAt } = req.body || {};

  try {
    const payload = { id, ...(scheduledAt ? { scheduledAt } : {}) };
    const { data, error } = await getResend().broadcasts.send(payload);
    if (error) {
      console.error('broadcasts.send error:', error);
      return res.status(502).json({ error: error.message || 'Upstream error' });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('broadcast send handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
