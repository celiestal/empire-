import Link from "next/link";
import { requestService } from "@/app/actions";
import { isOwner } from "@/lib/auth";
import { clientsFor, SERVICE_PACKAGES } from "@/lib/services";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Done-for-you short videos | Empire" };

export default async function Services({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  const owner = isOwner(await currentUser());
  const growth = SERVICE_PACKAGES[1];

  return (
    <>
      <h1>Short videos for your business, done for you</h1>
      <p className="muted">
        Send us your raw phone clips. We send back scroll-stopping vertical videos for Instagram Reels, TikTok and
        YouTube Shorts: dead air cut, captions, zooms, sound and a hook in the first second. Monthly, cancel any time.
      </p>

      {owner && (
        <p className="notice ok">
          Owner view: {clientsFor(1000, growth)} Growth clients = $
          {(clientsFor(1000, growth) * growth.monthlyUsd).toLocaleString()}/month.{" "}
          <Link href="/services/leads">See requests</Link>
        </p>
      )}

      <section className="grid three">
        {SERVICE_PACKAGES.map((p) => (
          <div key={p.id} className={`card stack${p.id === "growth" ? " highlight" : ""}`}>
            <h2>
              {p.name} {p.id === "growth" && <span className="pill premium">Most popular</span>}
            </h2>
            <div className="price">
              ${p.monthlyUsd}
              <span className="muted small">/month</span>
            </div>
            <ul>
              {p.includes.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <h2>How it works</h2>
        <ol>
          <li>Tell us about your business below. We reply within one working day.</li>
          <li>Film short clips on your phone: answer a customer question, show your work, give a tip.</li>
          <li>Upload them. Edited videos with captions and hashtags come back within 48 hours.</li>
        </ol>
      </section>

      <section id="start" className="card stack" style={{ marginTop: 16 }}>
        <h2>Get started</h2>
        {sent && <p className="notice ok">Thanks. We got your request and will email you within one working day.</p>}
        {error && <p className="notice error">{error}</p>}
        {!sent && (
          <form action={requestService} className="stack">
            <label>
              Your name <input name="name" type="text" required maxLength={120} />
            </label>
            <label>
              Email <input name="email" type="email" required />
            </label>
            <label>
              Business name and what you do <input name="business" type="text" required maxLength={160} />
            </label>
            <label>
              Package{" "}
              <select name="package" defaultValue="growth">
                {SERVICE_PACKAGES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, ${p.monthlyUsd}/month
                  </option>
                ))}
              </select>
            </label>
            <label>
              Anything else? <textarea name="message" rows={3} maxLength={2000} />
            </label>
            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: -9999 }}
            />
            <button className="primary">Send request</button>
          </form>
        )}
      </section>
    </>
  );
}
