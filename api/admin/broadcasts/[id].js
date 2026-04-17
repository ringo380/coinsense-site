import { Resend } from 'resend';
import { requireAdmin } from '../_auth.js';

let client;
const getResend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = (req.query?.id || '').toString();
  if (!id) return res.status(400).json({ error: 'id required' });

  const resend = getResend();

  try {
    if (req.method === 'GET') {
      const { data, error } = await resend.broadcasts.get({ id });
      if (error) {
        console.error('broadcasts.get error:', error);
        return res.status(502).json({ error: error.message || 'Upstream error' });
      }
      return res.status(200).json(data);
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const { subject, html, text, name, replyTo, previewText } = body;
      const payload = {
        id,
        ...(subject ? { subject } : {}),
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(name ? { name } : {}),
        ...(replyTo ? { replyTo } : {}),
        ...(previewText ? { previewText } : {}),
      };

      const { data, error } = await resend.broadcasts.update(payload);
      if (error) {
        console.error('broadcasts.update error:', error);
        return res.status(502).json({ error: error.message || 'Upstream error' });
      }
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { error } = await resend.broadcasts.remove({ id });
      if (error) {
        console.error('broadcasts.remove error:', error);
        return res.status(502).json({ error: error.message || 'Upstream error' });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('broadcast [id] handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
