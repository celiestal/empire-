import Link from "next/link";
import { PREMIUM_PRICE_LABEL } from "@/lib/billing";
import { TECHNIQUES } from "@/lib/video/techniques";

export default function Home() {
  return (
    <>
      <section>
        <h1>Plan, write and edit short videos that hook people.</h1>
        <p className="lead">
          Empire keeps your content on schedule: a content gap list, a weekly plan, AI-written hooks and scripts,
          hashtags that match each video, and an auto editor that cuts your raw clip into a fast, captioned vertical
          video.
        </p>
        <div className="row">
          <Link href="/signup" className="btn primary">
            Start free
          </Link>
          <Link href="/pricing" className="btn">
            See pricing
          </Link>
        </div>
      </section>

      <section className="grid three">
        <div className="card">
          <h3>Plan the week in an hour</h3>
          <p className="muted small">
            Keep a list of the questions your audience asks. Empire picks the most-asked ones and lays them out on
            your posting days: plan Sunday, film Monday, posts go out Monday, Wednesday and Friday.
          </p>
          <span className="pill">Free</span>
        </div>
        <div className="card">
          <h3>AI hooks, scripts and hashtags</h3>
          <p className="muted small">
            Three hook options, a hook-setup-value-close script sized to 60 seconds, a caption that invites comments,
            and 3 to 5 hashtags about what the video covers. Never #fyp.
          </p>
          <span className="pill premium">Premium</span>
        </div>
        <div className="card">
          <h3>Auto editor</h3>
          <p className="muted small">
            Upload a raw take. Empire cuts the pauses, adds punch-in zooms, word-by-word captions, the hook on
            screen, sound on the cuts and a progress bar, then exports 1080x1920.
          </p>
          <span className="pill premium">Premium</span>
        </div>
      </section>

      <section className="card">
        <h2>What the auto editor does, and why</h2>
        <p className="muted small">Based on what top-performing short-form videos do in their first seconds.</p>
        <div className="table-wrap">
          <table>
            <tbody>
              {TECHNIQUES.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                  </td>
                  <td className="muted">{t.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="row">
        <p className="muted">Basic is free. Premium is {PREMIUM_PRICE_LABEL}.</p>
        <Link href="/signup" className="btn primary">
          Create your account
        </Link>
      </section>
    </>
  );
}
