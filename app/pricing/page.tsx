import Link from "next/link";
import { startCheckout } from "@/app/actions";
import { hasFeature, isOwner } from "@/lib/auth";
import { billingEnabled, PREMIUM_PRICE_LABEL } from "@/lib/billing";
import { currentUser } from "@/lib/session";

export default async function Pricing({ searchParams }: { searchParams: Promise<{ error?: string; from?: string }> }) {
  const { error, from } = await searchParams;
  const user = await currentUser();
  const premium = hasFeature(user, "ai_content");

  return (
    <>
      <h1>Pricing</h1>
      {from && <p className="notice">That feature is part of Premium.</p>}
      {error && <p className="notice error">{error}</p>}
      <section className="grid two">
        <div className="card stack">
          <h2>Basic</h2>
          <div className="price">Free</div>
          <ul>
            <li>Content gap list</li>
            <li>Weekly planner and posting calendar</li>
            <li>Script editor with the hook, setup, value, close template</li>
            <li>Hashtag checker (3 to 5 tags, no generic tags)</li>
            <li>Save your social accounts</li>
          </ul>
          {!user && (
            <Link href="/signup" className="btn">
              Start free
            </Link>
          )}
        </div>
        <div className="card highlight stack">
          <h2>
            Premium <span className="pill premium">Most popular</span>
          </h2>
          <div className="price">{PREMIUM_PRICE_LABEL}</div>
          <ul>
            <li>Everything in Basic</li>
            <li>AI hooks, scripts, captions and hashtags</li>
            <li>Auto editor: pauses cut, zooms, captions, sound, progress bar</li>
          </ul>
          {premium ? (
            <span className="pill good">{isOwner(user) ? "Included for the owner" : "You have Premium"}</span>
          ) : user ? (
            <form action={startCheckout}>
              <button className="primary" disabled={!billingEnabled()}>
                {billingEnabled() ? "Upgrade" : "Payments coming soon"}
              </button>
            </form>
          ) : (
            <Link href="/signup" className="btn primary">
              Sign up to upgrade
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
