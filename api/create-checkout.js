import Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

function getUserIdFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));
    return payload.sub || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = getUserIdFromToken(token);
    if (!userId) return res.status(401).json({ error: 'Invalid token' });

    const clerkUser = await clerk.users.getUser(userId);
    let customerId = clerkUser.privateMetadata?.stripeCustomerId;

    if (!customerId) {
      const primaryEmail = clerkUser.emailAddresses?.[0]?.emailAddress;
      const customer = await stripe.customers.create({
        email: primaryEmail,
        name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || undefined,
        metadata: { clerkUserId: userId },
      });
      customerId = customer.id;
      await clerk.users.updateUser(userId, {
        privateMetadata: { stripeCustomerId: customerId },
      });
    }

    const origin = req.headers.origin || 'https://flowedge-rgxp.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: userId,
      subscription_data: { trial_period_days: 7 },
      success_url: `${origin}/?upgraded=1`,
      cancel_url: `${origin}/`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('create-checkout error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
