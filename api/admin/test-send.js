import { Resend } from 'resend';
import { requireAdmin } from './_auth.js';

let client;
const getResend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const from = process.env.RESEND_FROM;
  if (!from) {
    return res.status(500).json({ error: 'RESEND_FROM not configured' });
  }

  const { to, subject, html, text } = req.body || {};
  if (!to || !EMAIL_RE.test(String(to).trim())) {
    return res.status(400).json({ error: 'Valid "to" address required' });
  }
  if (!subject || (!html && !text)) {
    return res.status(400).json({ error: 'subject and html (or text) required' });
  }

  try {
    const { data, error } = await getResend().emails.send({
      from,
      to: [String(to).trim()],
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      headers: {
        'List-Unsubscribe': '<mailto:unsubscribe@coinsense.cash>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (error) {
      console.error('emails.send error:', error);
      return res.status(502).json({ error: error.message || 'Upstream error' });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('test-send handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
