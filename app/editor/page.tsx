import Link from "next/link";
import { hasFeature } from "@/lib/auth";
import { scriptText } from "@/lib/content-ai";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { TECHNIQUES } from "@/lib/video/techniques";
import { editorAvailable } from "@/lib/env";
import { EditorForm } from "./EditorForm";

export default async function Editor({ searchParams }: { searchParams: Promise<{ post?: string }> }) {
  const { post: postId } = await searchParams;
  const user = await requireUser();
  const premium = hasFeature(user, "auto_edit");
  const post = postId ? await getStore().get("contentPosts", postId) : null;
  const mine = post && post.userId === user.id ? post : null;

  return (
    <>
      <h1>Auto Editor</h1>
      <p className="lead">
        Upload a raw talking-head take. You get back a 1080x1920 video with the pauses cut, punch-in zooms, captions,
        your hook on screen, sound on the cuts and a progress bar.
      </p>

      {!editorAvailable() ? (
        <div className="card stack">
          <p>
            <strong>Coming soon.</strong> The auto editor is being moved to a video server. Everything below is what it
            will do to your videos.
          </p>
        </div>
      ) : premium ? (
        <EditorForm
          defaultHook={mine?.script?.hook ?? ""}
          defaultScript={mine?.script ? scriptText(mine.script) : ""}
          maxSeconds={120}
        />
      ) : (
        <div className="card stack">
          <p>The auto editor is part of Premium.</p>
          <Link href="/pricing?from=editor" className="btn primary">
            See Premium
          </Link>
        </div>
      )}

      <section className="card">
        <h2>What it does to your video</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Technique</th>
                <th>What the editor does</th>
              </tr>
            </thead>
            <tbody>
              {TECHNIQUES.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    <div className="small muted">{t.why}</div>
                  </td>
                  <td className="small">{t.howTheEditorDoesIt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
