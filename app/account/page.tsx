import Link from "next/link";
import { logOut, openBillingPortal } from "@/app/actions";
import { hasFeature, isOwner } from "@/lib/auth";
import { requireUser } from "@/lib/session";

export default async function Account({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const { upgraded } = await searchParams;
  const user = await requireUser();
  const owner = isOwner(user);
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <h1>Account</h1>
      {upgraded && (
        <p className="notice ok">Thanks! Premium switches on as soon as the payment is confirmed (usually seconds).</p>
      )}
      <div className="card stack">
        <div>
          <label>Email</label>
          {user.email}
        </div>
        <div>
          <label>Plan</label>
          {owner ? (
            <span className="pill premium">Owner: everything included</span>
          ) : hasFeature(user, "ai_content") ? (
            <span className="pill premium">Premium</span>
          ) : (
            <span className="pill">Basic (free)</span>
          )}
        </div>
        <div className="row">
          {!owner && !hasFeature(user, "ai_content") && (
            <Link href="/pricing" className="btn primary">
              Upgrade to Premium
            </Link>
          )}
          {user.stripeCustomerId && (
            <form action={openBillingPortal}>
              <button>Manage billing</button>
            </form>
          )}
          <form action={logOut}>
            <button>Log out</button>
          </form>
        </div>
      </div>
    </div>
  );
}
