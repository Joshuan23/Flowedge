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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await clerk.users.getUser(userId);
    const broker = user.privateMetadata?.broker;
    if (!broker?.alpacaKey) return res.status(400).json({ error: 'No broker connected' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { symbol, qty, side, type, limitPrice, timeInForce } = body || {};

    if (!symbol || !qty || !side || !type) return res.status(400).json({ error: 'symbol, qty, side, type required' });
    if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'side must be buy or sell' });
    if (!['market', 'limit'].includes(type)) return res.status(400).json({ error: 'type must be market or limit' });
    if (type === 'limit' && !limitPrice) return res.status(400).json({ error: 'limitPrice required for limit orders' });

    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty <= 0) return res.status(400).json({ error: 'qty must be a positive number' });

    const baseUrl = broker.mode === 'live'
      ? 'https://api.alpaca.markets'
      : 'https://paper-api.alpaca.markets';

    const orderBody = {
      symbol: symbol.toUpperCase(),
      qty: parsedQty.toString(),
      side,
      type,
      time_in_force: timeInForce || (type === 'market' ? 'day' : 'gtc'),
    };
    if (type === 'limit') orderBody.limit_price = parseFloat(limitPrice).toFixed(2);

    const orderRes = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': broker.alpacaKey,
        'APCA-API-SECRET-KEY': broker.alpacaSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });

    const order = await orderRes.json();
    if (!orderRes.ok) return res.status(orderRes.status).json({ error: order.message || 'Order failed' });

    return res.json({ order });
  } catch (e) {
    console.error('broker-order error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
