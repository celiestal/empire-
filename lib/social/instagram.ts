import { json, sleep, type SocialProvider } from "./types";

/**
 * Instagram API with Instagram Login. Free. Needs a Meta developer app with the
 * Instagram product, and the Instagram account must be a Professional
 * (Creator or Business) account. While the app is in development mode it can
 * post for accounts added to the app as Instagram testers, which is all the
 * owner needs.
 */
const GRAPH = "https://graph.instagram.com/v23.0";

export const instagram: SocialProvider = {
  platform: "instagram",
  env: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
  setupUrl: "https://developers.facebook.com/apps/",

  authUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "instagram_business_basic,instagram_business_content_publish",
      state,
      // Always ask which account to log in with, so the right one gets connected.
      force_reauth: "true",
    });
    return `https://www.instagram.com/oauth/authorize?${q}`;
  },

  async connect(code, redirectUri) {
    const short = await json<{ access_token: string; user_id: number | string }>(
      await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.INSTAGRAM_APP_ID ?? "",
          client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      }),
      "Instagram login",
    );
    const long = await json<{ access_token: string; expires_in: number }>(
      await fetch(
        `https://graph.instagram.com/access_token?${new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
          access_token: short.access_token,
        })}`,
      ),
      "Instagram long-lived token",
    );
    const me = await json<{ user_id?: string; id: string; username: string }>(
      await fetch(`${GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(long.access_token)}`),
      "Instagram profile",
    );
    return [
      {
        externalId: String(me.user_id ?? me.id),
        handle: me.username,
        token: long.access_token,
        expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(),
      },
    ];
  },

  async publish(account, input) {
    let token = account.token;
    let refreshed: { token: string; expiresAt: string | null } | undefined;
    // Long-lived tokens last 60 days; refresh when fewer than 20 remain.
    if (account.expiresAt && Date.parse(account.expiresAt) - Date.now() < 20 * 86_400_000) {
      const r = await json<{ access_token: string; expires_in: number }>(
        await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`),
        "Instagram token refresh",
      );
      token = r.access_token;
      refreshed = { token, expiresAt: new Date(Date.now() + r.expires_in * 1000).toISOString() };
    }
    const container = await json<{ id: string }>(
      await fetch(`${GRAPH}/${account.externalId}/media`, {
        method: "POST",
        body: new URLSearchParams({
          media_type: "REELS",
          video_url: input.videoUrl,
          caption: input.caption,
          share_to_feed: "true",
          access_token: token,
        }),
      }),
      "Instagram upload",
    );
    // Instagram downloads and processes the video; wait until it's ready (up to ~4 minutes).
    for (let i = 0; i < 48; i++) {
      const s = await json<{ status_code: string; status?: string }>(
        await fetch(`${GRAPH}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`),
        "Instagram processing check",
      );
      if (s.status_code === "FINISHED") break;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram could not process the video: ${s.status ?? s.status_code}`);
      await sleep(5000);
    }
    const done = await json<{ id: string }>(
      await fetch(`${GRAPH}/${account.externalId}/media_publish`, {
        method: "POST",
        body: new URLSearchParams({ creation_id: container.id, access_token: token }),
      }),
      "Instagram publish",
    );
    return { externalId: done.id, refreshed };
  },
};
