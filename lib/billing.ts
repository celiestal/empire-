import Stripe from "stripe";

/**
 * Billing through Stripe. Off until STRIPE_SECRET_KEY and STRIPE_PREMIUM_PRICE_ID
 * are set, so nobody can be charged by accident.
 */

export const PREMIUM_PRICE_LABEL = process.env.NEXT_PUBLIC_PREMIUM_PRICE_LABEL ?? "$19/month";

export function billingEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PREMIUM_PRICE_ID;
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Billing is not set up: STRIPE_SECRET_KEY is missing.");
  client ??= new Stripe(key);
  return client;
}

export async function createCheckoutUrl(opts: {
  userId: string;
  email: string;
  customerId: string | null;
  origin: string;
}): Promise<string> {
  const price = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!price) throw new Error("Billing is not set up: STRIPE_PREMIUM_PRICE_ID is missing.");
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: opts.userId,
    ...(opts.customerId ? { customer: opts.customerId } : { customer_email: opts.email }),
    metadata: { userId: opts.userId },
    subscription_data: { metadata: { userId: opts.userId } },
    success_url: `${opts.origin}/account?upgraded=1`,
    cancel_url: `${opts.origin}/pricing`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalUrl(customerId: string, origin: string): Promise<string> {
  const portal = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/account`,
  });
  return portal.url;
}
