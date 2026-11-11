import { json, type SocialProvider } from "./types";

/**
 * Facebook Page video posts through the Graph API. Free. Uses a Meta developer
 * app with Facebook Login; in development mode it works for the app's admins,
 * which covers the owner's own Page.
 */
const V = "v23.0";

export const facebook: SocialProvider = {
  platform: "facebook",
  env: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
  setupUrl: "https://developers.facebook.com/apps/",

  authUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID ?? "",
      redirect_uri: redirectUri,
      state,
      scope: "pages_show_list,pages_read_engagement,pages_manage_posts",
      response_type: "code",
    });
    return `https://www.facebook.com/${V}/dialog/oauth?${q}`;
  },

  async connect(code, redirectUri) {
    const base = { client_id: process.env.FACEBOOK_APP_ID ?? "", client_secret: process.env.FACEBOOK_APP_SECRET ?? "" };
    const short = await json<{ access_token: string }>(
      await fetch(`https://graph.facebook.com/${V}/oauth/access_token?${new URLSearchParams({ ...base, redirect_uri: redirectUri, code })}`),
      "Facebook login",
    );
    const long = await json<{ access_token: string }>(
      await fetch(`https://graph.facebook.com/${V}/oauth/access_token?${new URLSearchParams({ ...base, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`),
      "Facebook long-lived token",
    );
    // Page tokens obtained from a long-lived user token don't expire.
    const pages = await json<{ data: { id: string; name: string; username?: string; access_token: string }[] }>(
      await fetch(`https://graph.facebook.com/${V}/me/accounts?fields=id,name,username,access_token&access_token=${encodeURIComponent(long.access_token)}`),
      "Facebook Pages",
    );
    return pages.data.map((p) => ({ externalId: p.id, handle: p.username ?? p.name, token: p.access_token, expiresAt: null }));
  },

  async publish(account, input) {
    const r = await json<{ id: string }>(
      await fetch(`https://graph-video.facebook.com/${V}/${account.externalId}/videos`, {
        method: "POST",
        body: new URLSearchParams({ file_url: input.videoUrl, description: input.caption, access_token: account.token }),
      }),
      "Facebook upload",
    );
    return { externalId: r.id };
  },
};
