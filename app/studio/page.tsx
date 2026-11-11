import Link from "next/link";
import {
  addIdea,
  bumpIdea,
  connectAccount,
  createPost,
  disconnectAccount,
  planWeek,
  runAutopilotNow,
  saveContentSettings,
  suggestIdeas,
  toggleAutopilot,
} from "@/app/actions";
import { freeAiEnabled } from "@/lib/free-ai";
import { NOT_SUPPORTED, provider, providerReady } from "@/lib/social";
import { hasFeature } from "@/lib/auth";
import { dayName, rankIdeas, upcomingWeek } from "@/lib/content";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { SOCIAL_PLATFORMS } from "@/lib/types";

const DAYS = [0, 1, 2, 3, 4, 5, 6];

export const maxDuration = 300;

export default async function Studio({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; ran?: string }>;
}) {
  const { error, connected, ran } = await searchParams;
  const user = await requireUser();
  const store = getStore();
  const [settings, ideas, posts, accounts, news, runs] = await Promise.all([
    store.contentSettings(user.id),
    store.listFor("contentIdeas", user.id),
    store.listFor("contentPosts", user.id),
    store.listFor("socialAccounts", user.id),
    store.list("news"),
    store.list("autopilotRuns"),
  ]);
  const lastRun = runs[0];
  const ai = freeAiEnabled();
  const week = upcomingWeek(settings);
  const ranked = rankIdeas(ideas);
  const premium = hasFeature(user, "ai_content");
  const upcoming = posts
    .filter((p) => p.status !== "posted")
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"));

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Content Studio</h1>
        {!premium && (
          <Link href="/pricing" className="btn">
            Unlock AI scripts and auto editing
          </Link>
        )}
      </div>

      {error && <p className="notice error">{error}</p>}
      {connected && <p className="notice ok">{connected}</p>}
      {ran && <p className="notice ok">Autopilot finished. See what it did below.</p>}

      <section className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Autopilot</h2>
          {premium && (
            <div className="row">
              <form action={toggleAutopilot}>
                <button className={settings.autopilot ? "" : "primary"}>{settings.autopilot ? "Turn autopilot off" : "Turn autopilot on"}</button>
              </form>
              <form action={runAutopilotNow}>
                <button>Run it now</button>
              </form>
            </div>
          )}
        </div>
        <p className="small muted">
          Every morning: two news scouts read the latest AI news and starting-a-business news, an idea agent turns the
          best stories into video questions, the planner fills your posting days, three writer agents (Teacher,
          Storyteller, Myth-buster) each script every post and an editor picks the best. Posts that have a video and
          auto-post on go out on their day to your connected accounts.{" "}
          {ai ? "Writing uses the free Gemini AI." : "Writing uses free templates until a free Gemini key is added."}
        </p>
        {premium ? (
          <p className="small">
            Status: <span className={`pill ${settings.autopilot ? "good" : ""}`}>{settings.autopilot ? "on" : "off"}</span>
          </p>
        ) : (
          <p className="small">Autopilot is part of Premium.</p>
        )}
        {lastRun && premium && (
          <details>
            <summary className="small">Last run {lastRun.createdAt.slice(0, 16).replace("T", " ")} UTC</summary>
            <ul className="small">
              {lastRun.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card">
        <h2>This week</h2>
        <p className="muted small">
          Plan on {dayName(settings.planningDay)} ({week.planning}, 1 hour), film and cut on{" "}
          {dayName(settings.filmingDay)} ({week.filming}, 2 hours), then posts go out on{" "}
          {week.posts.map((d) => dayName(new Date(`${d}T00:00:00Z`).getUTCDay())).join(", ")}. Target{" "}
          {settings.targetSeconds} seconds, {settings.maxSeconds} max.
        </p>
        <div className="row">
          <form action={planWeek}>
            <button className="primary" disabled={!ranked.length}>
              Plan next week from the top {week.posts.length} ideas
            </button>
          </form>
          {!ranked.length && <span className="small muted">Add ideas to the content gap list first.</span>}
        </div>
      </section>

      <section className="grid two">
        <div className="card stack">
          <h2>Posts</h2>
          {upcoming.length === 0 && <p className="muted small">No posts planned yet.</p>}
          <ul className="clean">
            {upcoming.map((p) => (
              <li key={p.id} className="row" style={{ justifyContent: "space-between" }}>
                <Link href={`/studio/posts/${p.id}`}>{p.topic}</Link>
                <span className="row">
                  <span className="pill">{p.status}</span>
                  <span className="small muted">{p.scheduledFor ?? "unscheduled"}</span>
                </span>
              </li>
            ))}
          </ul>
          <form action={createPost} className="stack">
            <div>
              <label htmlFor="topic">New post topic</label>
              <input id="topic" name="topic" type="text" placeholder="e.g. How to price your first service" required />
            </div>
            <div className="row">
              <input name="scheduledFor" type="date" style={{ maxWidth: 180 }} />
              <button>Add post</button>
            </div>
          </form>
        </div>

        <div className="card stack">
          <h2>Content gap list</h2>
          <p className="muted small">
            Questions your audience asks that nobody answers well. Bump one each time it comes up again; the most-asked
            get planned first.
          </p>
          <ul className="clean">
            {ranked.map((i) => (
              <li key={i.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>{i.question}</span>
                <form action={bumpIdea} className="row">
                  <input type="hidden" name="id" value={i.id} />
                  <span className="small muted">asked {i.asks}x</span>
                  <button title="Asked again">+1</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addIdea} className="stack">
            <input name="question" type="text" placeholder="A question from comments, DMs or a competitor's comments" required />
            <div className="row">
              <select name="source" style={{ maxWidth: 200 }}>
                <option value="comments">Comments</option>
                <option value="dms">DMs</option>
                <option value="competitor">Competitor's comments</option>
                <option value="manual">My own idea</option>
              </select>
              <button>Add idea</button>
            </div>
          </form>
          <form action={suggestIdeas}>
            <button title="Adds starter questions for your niche. Free.">Suggest ideas for my niche</button>
          </form>
        </div>
      </section>

      <section className="grid two">
        <div className="card stack">
          <h2>Social accounts</h2>
          <p className="small muted">
            Type the exact account to post to (for example @anthro_agent), then Connect and log in to that account.
            Empire refuses any other account.
          </p>
          <ul className="clean stack">
            {SOCIAL_PLATFORMS.map((p) => {
              const acct = accounts.find((a) => a.platform === p.id);
              const prov = provider(p.id);
              const ready = !!prov && providerReady(prov);
              const isConnected = acct?.status === "connected";
              return (
                <li key={p.id} className="stack">
                  <form action={connectAccount} className="row">
                    <input type="hidden" name="platform" value={p.id} />
                    <strong style={{ minWidth: 130 }}>{p.label}</strong>
                    <input
                      name="handle"
                      type="text"
                      placeholder="@handle"
                      defaultValue={acct ? `@${acct.handle}` : ""}
                      style={{ maxWidth: 170 }}
                    />
                    <button>Save</button>
                    {isConnected && <span className="pill good">connected</span>}
                  </form>
                  <div className="row small">
                    {NOT_SUPPORTED[p.id] ? (
                      <span className="muted">{NOT_SUPPORTED[p.id]}</span>
                    ) : !ready ? (
                      <span className="muted">Auto-posting needs a free developer app on the server first.</span>
                    ) : acct && acct.status !== "disconnected" ? (
                      <>
                        <a className="btn" href={`/api/social/${p.id}/connect`}>
                          {isConnected ? "Reconnect" : `Connect @${acct.handle}`}
                        </a>
                        {isConnected && (
                          <form action={disconnectAccount}>
                            <input type="hidden" name="id" value={acct.id} />
                            <button>Disconnect</button>
                          </form>
                        )}
                      </>
                    ) : (
                      <span className="muted">Save the handle first, then connect.</span>
                    )}
                    {acct?.lastError && <span style={{ color: "var(--bad)" }}>Last error: {acct.lastError}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card stack">
          <h2>Brand and schedule</h2>
          <form action={saveContentSettings} className="stack">
            <div className="grid two">
              <div>
                <label htmlFor="brandTag">Brand hashtag (every post)</label>
                <input id="brandTag" name="brandTag" type="text" defaultValue={settings.brandTag} />
              </div>
              <div>
                <label htmlFor="nicheTags">Niche hashtags (1 to 2, same every week)</label>
                <input id="nicheTags" name="nicheTags" type="text" defaultValue={settings.nicheTags.join(" ")} />
              </div>
            </div>
            <div>
              <label htmlFor="audience">Who the videos are for</label>
              <input id="audience" name="audience" type="text" defaultValue={settings.audience} />
            </div>
            <div className="grid two">
              <div>
                <label htmlFor="planningDay">Planning day</label>
                <select id="planningDay" name="planningDay" defaultValue={settings.planningDay}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {dayName(d)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filmingDay">Filming day</label>
                <select id="filmingDay" name="filmingDay" defaultValue={settings.filmingDay}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {dayName(d)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label>Posting days</label>
              <div className="checks">
                {DAYS.map((d) => (
                  <label key={d}>
                    <input type="checkbox" name="postingDays" value={d} defaultChecked={settings.postingDays.includes(d)} />
                    {dayName(d).slice(0, 3)}
                  </label>
                ))}
              </div>
            </div>
            <button>Save</button>
          </form>
        </div>
      </section>
      <section className="grid two">
        {(["ai", "business"] as const).map((kind) => (
          <div key={kind} className="card stack">
            <h2>{kind === "ai" ? "AI news" : "Business news"}</h2>
            <ul className="clean small">
              {news
                .filter((n) => n.kind === kind)
                .slice(0, 6)
                .map((n) => (
                  <li key={n.id}>
                    <a href={n.link} target="_blank" rel="noreferrer">
                      {n.title}
                    </a>{" "}
                    <span className="muted">{n.source}</span>
                  </li>
                ))}
            </ul>
            {!news.some((n) => n.kind === kind) && <p className="small muted">The news scout fills this on the next autopilot run.</p>}
          </div>
        ))}
      </section>
    </>
  );
}
