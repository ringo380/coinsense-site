import pg from 'pg';
import { requireAdmin } from './_auth.js';

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

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const broadcastId = (req.query?.broadcast_id || '').toString();
  const limit = Math.min(parseInt(req.query?.limit || '200', 10) || 200, 1000);

  try {
    const client = await getPool().connect();
    try {
      if (broadcastId) {
        const { rows } = await client.query(
          `select event_type, count(*)::int as count
             from email_events
            where broadcast_id = $1
            group by event_type`,
          [broadcastId]
        );
        const counts = Object.fromEntries(rows.map((r) => [r.event_type, r.count]));
        return res.status(200).json({ broadcast_id: broadcastId, counts });
      }

      const { rows } = await client.query(
        `select id, email_id, event_type, email, broadcast_id, click_url, ts
           from email_events
          order by ts desc
          limit $1`,
        [limit]
      );
      return res.status(200).json({ events: rows });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('events handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
