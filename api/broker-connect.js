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
      const broker = user.privateMetadata?.broker;
      return res.json({ connected: !!broker?.alpacaKey, mode: broker?.mode || 'paper' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { alpacaKey, alpacaSecret, mode } = body || {};
      if (!alpacaKey || !alpacaSecret) return res.status(400).json({ error: 'API key and secret required' });

      const baseUrl = mode === 'live'
        ? 'https://api.alpaca.markets'
        : 'https://paper-api.alpaca.markets';

      const verify = await fetch(`${baseUrl}/v2/account`, {
        headers: { 'APCA-API-KEY-ID': alpacaKey, 'APCA-API-SECRET-KEY': alpacaSecret },
      });
      if (!verify.ok) {
        const err = await verify.json().catch(() => ({}));
        return res.status(400).json({ error: err.message || 'Invalid Alpaca credentials' });
      }

      const user = await clerk.users.getUser(userId);
      await clerk.users.updateUser(userId, {
        privateMetadata: { ...user.privateMetadata, broker: { alpacaKey, alpacaSecret, mode: mode || 'paper' } },
      });
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const user = await clerk.users.getUser(userId);
      const { broker: _removed, ...rest } = user.privateMetadata || {};
      await clerk.users.updateUser(userId, { privateMetadata: rest });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('broker-connect error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
