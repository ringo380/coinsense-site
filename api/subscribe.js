import { Resend } from 'resend';

let client;
const getResend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('Missing RESEND_API_KEY');
    return res.status(500).json({ error: 'Subscription is temporarily unavailable.' });
  }

  try {
    const { error } = await getResend().contacts.create({
      email: email.trim().toLowerCase(),
      unsubscribed: false,
      properties: {
        source: 'coinsense-site',
      },
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists')) {
        return res.status(200).json({ ok: true, alreadySubscribed: true });
      }
      console.error('Resend error:', error);
      return res.status(500).json({ error: 'Subscription failed. Please try again.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return res.status(500).json({ error: 'Subscription failed. Please try again.' });
  }
}
