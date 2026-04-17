import crypto from 'node:crypto';

export function requireAdmin(req, res) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    console.error('ADMIN_TOKEN not configured');
    res.status(500).json({ error: 'Admin not configured' });
    return false;
  }

  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}
