"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";

async function toStorage(file: File, onPct: (n: number) => void): Promise<string> {
  const blob = await upload(`raw/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    clientPayload: "editor",
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: (p) => onPct(Math.round(p.percentage)),
  });
  return blob.url;
}

export function EditorForm(props: { defaultHook: string; defaultScript: string; maxSeconds: number; postId?: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("working");
    setMessage("Editing your video. This takes about as long as the video itself.");
    setVideoUrl(null);
    try {
      const fd = new FormData(e.currentTarget);
      const video = fd.get("video");
      const music = fd.get("music");
      if (!(video instanceof File) || !video.size) throw new Error("Choose a video file.");
      const videoUrlIn = await toStorage(video, (n) => setMessage(`Uploading your video: ${n}%`));
      const musicUrl = music instanceof File && music.size ? await toStorage(music, (n) => setMessage(`Uploading music: ${n}%`)) : undefined;
      setMessage("Editing your video. This takes one to three minutes.");
      const res = await fetch("/api/editor/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: videoUrlIn,
          musicUrl,
          hook: fd.get("hook"),
          script: fd.get("script"),
          emphasis: fd.get("emphasis"),
          sfx: fd.get("sfx") === "on",
          progress: fd.get("progress") === "on",
          postId: props.postId,
        }),
      });
      const body = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) throw new Error(body.error ?? "The edit failed.");
      setVideoUrl(body.url);
      setState("done");
      setMessage(body.summary ?? "Done.");
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
          <a className="btn" href={videoUrl} target="_blank" rel="noreferrer" download="empire-edit.mp4">
            Download
          </a>
        </div>
      )}
    </form>
  );
}
