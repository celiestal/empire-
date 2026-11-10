import type Stripe from "stripe";
import { stripe } from "@/lib/billing";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/** Stripe tells us when someone pays or cancels. Configure it to send the events below. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  const store = getStore();
  const setPlan = async (userId: string | null | undefined, plan: "free" | "premium", customer?: string | null) => {
    if (!userId) return;
    const user = await store.get("users", userId);
    if (!user) return;
    await store.update("users", userId, { plan, ...(customer ? { stripeCustomerId: customer } : {}) });
    await store.audit("stripe", `plan_${plan}`, user.email);
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const customer = typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
      await setPlan(s.client_reference_id ?? s.metadata?.userId, "premium", customer);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const active = event.type === "customer.subscription.updated" && ["active", "trialing"].includes(sub.status);
      await setPlan(sub.metadata?.userId, active ? "premium" : "free");
      break;
    }
  }
  return new Response("ok");
}
