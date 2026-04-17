import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

let pool;
const getPool = () => {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  return pool;
};

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function verifySvix(rawBody, headers, secret) {
  const svixId = headers['svix-id'];
  const svixTs = headers['svix-timestamp'];
  const svixSig = headers['svix-signature'];
  if (!svixId || !svixTs || !svixSig) return false;

  const ts = parseInt(svixTs, 10);
  if (Number.isNaN(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 300) return false;

  const prefix = 'whsec_';
  const raw = secret.startsWith(prefix) ? secret.slice(prefix.length) : secret;
  const key = Buffer.from(raw, 'base64');

  const signed = `${svixId}.${svixTs}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signed).digest('base64');

  const provided = svixSig
    .split(' ')
    .map((part) => part.split(',')[1])
    .filter(Boolean);

  return provided.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

const TYPE_MAP = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delivery_delayed',
  'email.failed': 'failed',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('raw body read failed', err);
    return res.status(400).json({ error: 'Invalid body' });
  }

  if (!verifySvix(rawBody, req.headers, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = TYPE_MAP[payload?.type];
  if (!eventType) {
    return res.status(200).json({ ok: true, ignored: payload?.type });
  }

  const data = payload?.data || {};
  const emailId = data.email_id || data.id;
  const recipient = Array.isArray(data.to) ? data.to[0] : data.to || data.email || null;
  const broadcastId = data.broadcast_id || data.broadcastId || null;
  const clickUrl = data.click?.link || null;
  const createdAt = data.created_at ? new Date(data.created_at) : new Date();

  if (!emailId) {
    console.error('webhook missing email_id', payload?.type, Object.keys(data));
    return res.status(400).json({ error: 'Missing email_id' });
  }

  try {
    const client = await getPool().connect();
    try {
      await client.query(
        `insert into email_events (email_id, event_type, email, broadcast_id, click_url, ts, raw)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [emailId, eventType, recipient, broadcastId, clickUrl, createdAt, payload]
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('webhook insert failed', err);
    return res.status(500).json({ error: 'Insert failed' });
  }

  return res.status(200).json({ ok: true });
}
