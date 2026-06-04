import Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

function getUserId(req) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
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
    let code = user.publicMetadata?.referralCode;

    if (!code) {
      const prefix = (user.firstName || 'FE').toUpperCase().slice(0, 4).replace(/[^A-Z]/g, 'X');
      code = `${prefix}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      // Find or create the referral coupon (1 month free)
      const coupons = await stripe.coupons.list({ limit: 100 });
      let coupon = coupons.data.find(c => c.metadata?.type === 'referral' && c.valid);
      if (!coupon) {
        coupon = await stripe.coupons.create({
          percent_off: 100,
          duration: 'once',
          name: 'FlowEdge Referral — 1 Month Free',
          metadata: { type: 'referral' },
        });
      }

      await stripe.promotionCodes.create({
        coupon: coupon.id,
        code,
        metadata: { referrerId: userId },
      });

      await clerk.users.updateUser(userId, {
        publicMetadata: { ...user.publicMetadata, referralCode: code },
      });
    }

    return res.json({ code, referralCount: user.publicMetadata?.referralCount || 0 });
  } catch (e) {
    console.error('referral error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
