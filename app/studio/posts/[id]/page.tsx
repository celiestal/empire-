import Link from "next/link";
import { notFound } from "next/navigation";
import { generateForPost, savePost } from "@/app/actions";
import { hasFeature } from "@/lib/auth";
import { hashtagProblems } from "@/lib/content";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { SOCIAL_PLATFORMS } from "@/lib/types";

const STATUSES = ["idea", "scripted", "filmed", "scheduled", "posted"] as const;

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const user = await requireUser();
  const post = await getStore().get("contentPosts", id);
  if (!post || post.userId !== user.id) notFound();
  const premium = hasFeature(user, "ai_content");
  const s = post.script;
  const problems = hashtagProblems(post.hashtags);
  const fullCaption = `${post.caption}\n\n${post.hashtags.join(" ")}`.trim();

  return (
    <>
      <p className="small">
        <Link href="/studio">Back to Content Studio</Link>
      </p>
      <h1>{post.topic}</h1>
      {error && <p className="notice error">{error}</p>}
      {saved && <p className="notice ok">Saved.</p>}

      <section className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>AI script</h2>
          <form action={generateForPost}>
            <input type="hidden" name="id" value={post.id} />
            {premium ? (
              <button className="primary">{s ? "Write it again" : "Write hooks, script and hashtags"}</button>
            ) : (
              <Link href="/pricing?from=ai" className="btn">
                Premium: write it with AI
              </Link>
            )}
          </form>
        </div>
        {s && (
          <div className="stack">
            <label>Hook options (pick one and paste it into Hook below)</label>
            <ol>
              {s.hookOptions.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          </div>
        )}
        {!s && (
          <p className="muted small">
            Template: Hook (0 to 3 s), Setup (3 to 15 s), three Value points, Close (last 10 s, one call to action).
          </p>
        )}
      </section>

      <form action={savePost} className="card stack">
        <input type="hidden" name="id" value={post.id} />
        <div>
          <label htmlFor="topic">Topic</label>
          <input id="topic" name="topic" type="text" defaultValue={post.topic} />
        </div>
        {s && (
          <>
            <div>
              <label htmlFor="hook">Hook (0 to 3 s)</label>
              <input id="hook" name="hook" type="text" defaultValue={s.hook} />
            </div>
            <div>
              <label htmlFor="setup">Setup (3 to 15 s)</label>
              <textarea id="setup" name="setup" defaultValue={s.setup} />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <label htmlFor={`value${i}`}>Value point {i + 1}</label>
                <input id={`value${i}`} name={`value${i}`} type="text" defaultValue={s.valuePoints[i] ?? ""} />
              </div>
            ))}
            <div>
              <label htmlFor="close">Close (call to action)</label>
              <input id="close" name="close" type="text" defaultValue={s.close} />
            </div>
          </>
        )}
        <div>
          <label htmlFor="caption">Caption (end with a question to get comments)</label>
          <input id="caption" name="caption" type="text" defaultValue={post.caption} />
        </div>
        <div>
          <label htmlFor="hashtags">Hashtags (3 to 5, about this video; no #fyp, #viral or #explore)</label>
          <input id="hashtags" name="hashtags" type="text" defaultValue={post.hashtags.join(" ")} />
          {problems.length > 0 && <p className="small" style={{ color: "var(--bad)" }}>{problems.join(" ")}</p>}
        </div>
        <div className="grid two">
          <div>
            <label htmlFor="scheduledFor">Goes live on</label>
            <input id="scheduledFor" name="scheduledFor" type="date" defaultValue={post.scheduledFor ?? ""} />
          </div>
          <div>
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={post.status}>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label>Post to</label>
          <div className="checks">
            {SOCIAL_PLATFORMS.map((p) => (
              <label key={p.id}>
                <input type="checkbox" name="platforms" value={p.id} defaultChecked={post.platforms.includes(p.id)} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <div className="row">
          <button className="primary">Save</button>
          <Link href={`/editor?post=${post.id}`} className="btn">
            Auto-edit the video
          </Link>
        </div>
      </form>

      <section className="card stack">
        <h2>Ready to paste</h2>
        <pre>{fullCaption || "Write a caption first."}</pre>
      </section>
    </>
  );
}
