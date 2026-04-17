import { Resend } from 'resend';
import { requireAdmin } from './_auth.js';

let client;
const getResend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  const resend = getResend();

  try {
    if (req.method === 'GET') {
      const { data, error } = await resend.contacts.list();
      if (error) {
        console.error('contacts.list error:', error);
        return res.status(502).json({ error: error.message || 'Upstream error' });
      }
      return res.status(200).json(data ?? { data: [] });
    }

    if (req.method === 'DELETE') {
      const email = (req.query?.email || '').toString().trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'email query param required' });

      const { error } = await resend.contacts.remove({ email });
      if (error) {
        console.error('contacts.remove error:', error);
        return res.status(502).json({ error: error.message || 'Upstream error' });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('contacts handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
