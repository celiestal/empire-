"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";
import { setPostVideo } from "@/app/actions";

export function VideoUpload({ postId, enabled }: { postId: string; enabled: boolean }) {
  const [state, setState] = useState<string>("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState("Uploading 0%");
    try {
      const blob = await upload(`videos/${postId}-${file.name.replace(/[^\w.-]/g, "_")}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: postId,
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: (p) => setState(`Uploading ${Math.round(p.percentage)}%`),
      });
      const fd = new FormData();
      fd.set("id", postId);
      fd.set("videoUrl", blob.url);
      await setPostVideo(fd);
    } catch (err) {
      setState(err instanceof Error ? err.message : "Upload failed");
    }
  }

  if (!enabled) return <p className="small muted">Video storage isn't switched on yet, so paste a public link to the video below instead.</p>;
  return (
    <div className="stack">
      <input type="file" accept="video/mp4,video/quicktime" onChange={(e) => onFile(e.target.files?.[0])} />
      {state && <p className="small">{state}</p>}
    </div>
  );
}
