import { json, type SocialProvider } from "./types";

/**
 * YouTube Shorts through the YouTube Data API. Free (an upload uses 1,600 of the
 * 10,000 daily quota units). Google keeps uploads from unverified apps private
 * until the app passes Google's free audit, so they appear as private videos
 * until then.
 */
async function accessToken(refreshToken: string): Promise<string> {
  const r = await json<{ access_token: string }>(
    await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    }),
    "YouTube sign-in refresh",
  );
  return r.access_token;
}

export const youtube: SocialProvider = {
  platform: "youtube",
  env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  setupUrl: "https://console.cloud.google.com/apis/credentials",

  authUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      prompt: "consent select_account",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },

  async connect(code, redirectUri) {
    const t = await json<{ access_token: string; refresh_token?: string }>(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code,
        }),
      }),
      "YouTube sign-in",
    );
    if (!t.refresh_token) throw new Error("Google didn't return a long-term sign-in. Remove Empire from your Google account's third-party access and connect again.");
    const ch = await json<{ items?: { id: string; snippet: { title: string; customUrl?: string } }[] }>(
      await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${t.access_token}` } }),
      "YouTube channel",
    );
    return (ch.items ?? []).map((c) => ({ externalId: c.id, handle: c.snippet.customUrl ?? c.snippet.title, token: t.refresh_token!, expiresAt: null }));
  },

  async publish(account, input) {
    const token = await accessToken(account.token);
    const video = await fetch(input.videoUrl);
    if (!video.ok) throw new Error(`Couldn't read the video file (${video.status})`);
    const bytes = Buffer.from(await video.arrayBuffer());
    const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": video.headers.get("content-type") ?? "video/mp4",
        "x-upload-content-length": String(bytes.length),
      },
      body: JSON.stringify({
        snippet: { title: `${input.title.slice(0, 90)} #Shorts`, description: input.caption, categoryId: "28" },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
    });
    if (!start.ok) await json(start, "YouTube upload start");
    const location = start.headers.get("location");
    if (!location) throw new Error("YouTube didn't return an upload address");
    const done = await json<{ id: string }>(
      await fetch(location, { method: "PUT", headers: { "content-type": video.headers.get("content-type") ?? "video/mp4" }, body: bytes }),
      "YouTube upload",
    );
    return { externalId: done.id };
  },
};
