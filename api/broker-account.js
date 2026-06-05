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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await clerk.users.getUser(userId);
    const broker = user.privateMetadata?.broker;
    if (!broker?.alpacaKey) return res.status(400).json({ error: 'No broker connected' });

    const baseUrl = broker.mode === 'live'
      ? 'https://api.alpaca.markets'
      : 'https://paper-api.alpaca.markets';

    const hdrs = {
      'APCA-API-KEY-ID': broker.alpacaKey,
      'APCA-API-SECRET-KEY': broker.alpacaSecret,
    };

    const [acctRes, posRes, ordRes] = await Promise.all([
      fetch(`${baseUrl}/v2/account`, { headers: hdrs }),
      fetch(`${baseUrl}/v2/positions`, { headers: hdrs }),
      fetch(`${baseUrl}/v2/orders?status=all&limit=20&direction=desc`, { headers: hdrs }),
    ]);

    const [account, positions, orders] = await Promise.all([
      acctRes.json(), posRes.json(), ordRes.json(),
    ]);

    if (account.code === 40110000) return res.status(401).json({ error: 'Invalid Alpaca credentials' });

    return res.json({ account, positions: Array.isArray(positions) ? positions : [], orders: Array.isArray(orders) ? orders : [], mode: broker.mode });
  } catch (e) {
    console.error('broker-account error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
