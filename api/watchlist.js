import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

function getUserId(req) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const user = await clerk.users.getUser(userId);
      return res.json({ watchlist: user.privateMetadata?.watchlist ?? null });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { watchlist } = body || {};
      if (!Array.isArray(watchlist)) return res.status(400).json({ error: 'Invalid watchlist' });
      const user = await clerk.users.getUser(userId);
      await clerk.users.updateUser(userId, {
        privateMetadata: { ...user.privateMetadata, watchlist },
      });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
