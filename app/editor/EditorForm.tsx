"use client";

import { useState } from "react";

export function EditorForm(props: { defaultHook: string; defaultScript: string; maxSeconds: number }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("working");
    setMessage("Editing your video. This takes about as long as the video itself.");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    try {
      const res = await fetch("/api/editor/render", { method: "POST", body: new FormData(e.currentTarget) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? "The edit failed.");
      }
      const summary = res.headers.get("x-edit-summary");
      setVideoUrl(URL.createObjectURL(await res.blob()));
      setState("done");
      setMessage(summary ?? "Done.");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "The edit failed.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      <div>
        <label htmlFor="video">Raw video (mp4 or mov)</label>
        <input id="video" name="video" type="file" accept="video/*" required />
      </div>
      <div>
        <label htmlFor="hook">On-screen hook (shown for the first 2.5 seconds)</label>
        <input id="hook" name="hook" type="text" defaultValue={props.defaultHook} placeholder="You're pricing this wrong" />
      </div>
      <div>
        <label htmlFor="script">What you say (used for captions; leave empty for no captions)</label>
        <textarea id="script" name="script" defaultValue={props.defaultScript} />
      </div>
      <div className="grid two">
        <div>
          <label htmlFor="emphasis">Words to highlight in captions (comma separated)</label>
          <input id="emphasis" name="emphasis" type="text" placeholder="wrong, free, 3x" />
        </div>
        <div>
          <label htmlFor="music">Background music (optional)</label>
          <input id="music" name="music" type="file" accept="audio/*" />
        </div>
      </div>
      <div className="checks">
        <label>
          <input type="checkbox" name="sfx" defaultChecked /> Sound effects on cuts
        </label>
        <label>
          <input type="checkbox" name="progress" defaultChecked /> Progress bar
        </label>
      </div>
      <div className="row">
        <button className="primary" disabled={state === "working"}>
          {state === "working" ? "Editing..." : "Edit my video"}
        </button>
        <span className="small muted">Max length {props.maxSeconds} seconds after pauses are cut.</span>
      </div>
      {message && <p className={`notice ${state === "error" ? "error" : state === "done" ? "ok" : ""}`}>{message}</p>}
      {videoUrl && (
        <div className="stack">
          <video src={videoUrl} controls playsInline style={{ width: "100%", maxWidth: 360, borderRadius: 12 }} />
          <a className="btn" href={videoUrl} download="empire-edit.mp4">
            Download
          </a>
        </div>
      )}
    </form>
  );
}
