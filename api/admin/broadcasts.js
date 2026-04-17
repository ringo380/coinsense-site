import { Resend } from 'resend';
import { requireAdmin } from './_auth.js';

let client;
const getResend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  const resend = getResend();

  try {
    if (req.method === 'GET') {
      const { data, error } = await resend.broadcasts.list();
      if (error) {
        console.error('broadcasts.list error:', error);
        return res.status(502).json({ error: error.message || 'Upstream error' });
      }
      return res.status(200).json(data ?? { data: [] });
    }

    if (req.method === 'POST') {
      const segmentId = process.env.RESEND_SEGMENT_ID;
      const from = process.env.RESEND_FROM;
      if (!segmentId || !from) {
        return res.status(500).json({
          error: 'Server misconfigured: RESEND_SEGMENT_ID and RESEND_FROM required',
        });
      }

      const body = req.body || {};
      const { subject, html, text, name, replyTo, previewText } = body;
      if (!subject || (!html && !text)) {
        return res.status(400).json({ error: 'subject and html (or text) required' });
      }

      const payload = {
        segmentId,
        from,
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(name ? { name } : {}),
        ...(replyTo ? { replyTo } : {}),
        ...(previewText ? { previewText } : {}),
      };

      const { data, error } = await resend.broadcasts.create(payload);
      if (error) {
        console.error('broadcasts.create error:', error);
        return res.status(502).json({ error: error.message || 'Upstream error' });
      }
      return res.status(201).json(data);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('broadcasts handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
