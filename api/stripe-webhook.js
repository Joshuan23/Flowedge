import Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Disable Vercel's body parser so we can get the raw bytes Stripe needs
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('Webhook signature error:', e.message);
    return res.status(400).json({ error: `Webhook Error: ${e.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        // grant access for paid and free-trial checkouts
        if (userId) {
          await clerk.users.updateUser(userId, {
            publicMetadata: { isPro: true },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        if (sub.status === 'past_due' || sub.status === 'unpaid') {
          const customer = await stripe.customers.retrieve(sub.customer);
          const userId = customer.metadata?.clerkUserId;
          if (userId) {
            await clerk.users.updateUser(userId, {
              publicMetadata: { isPro: false },
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const userId = customer.metadata?.clerkUserId;
        if (userId) {
          await clerk.users.updateUser(userId, {
            publicMetadata: { isPro: false },
          });
        }
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('Webhook handler error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
