/**
 * Grant or revoke Pro access for a user by email.
 *
 * Usage:
 *   CLERK_SECRET_KEY=sk_live_... node scripts/grant-pro.js grant  wonderjash0@gmail.com
 *   CLERK_SECRET_KEY=sk_live_... node scripts/grant-pro.js revoke wonderjash0@gmail.com
 *
 * Requires @clerk/backend (already in project deps).
 */

import { createClerkClient } from '@clerk/backend';

const [,, action, email] = process.argv;

if (!['grant', 'revoke'].includes(action) || !email) {
  console.error('Usage: node scripts/grant-pro.js <grant|revoke> <email>');
  process.exit(1);
}

if (!process.env.CLERK_SECRET_KEY) {
  console.error('Set CLERK_SECRET_KEY before running this script.');
  process.exit(1);
}

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

(async () => {
  const res = await clerk.users.getUserList({ emailAddress: [email] });
  const user = res?.data?.[0] ?? res?.[0];

  if (!user) {
    console.error(`No Clerk user found with email: ${email}`);
    process.exit(1);
  }

  const isPro = action === 'grant';
  await clerk.users.updateUser(user.id, {
    publicMetadata: { ...user.publicMetadata, isPro },
  });

  const status = isPro ? '✅ Pro access GRANTED' : '🚫 Pro access REVOKED';
  console.log(`${status} → ${email} (${user.id})`);
})();
