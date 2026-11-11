import { signValue } from "@/lib/auth";
import { provider, providerReady } from "@/lib/social";
import { currentUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { siteOrigin } from "@/lib/site";

/** Starts the platform's login. The account handle saved in the studio is carried along so only that account is accepted. */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const origin = siteOrigin(req);
  const user = await currentUser();
  if (!user) return Response.redirect(`${origin}/login`, 303);
  const p = provider(platform);
  if (!p || !providerReady(p)) return Response.redirect(`${origin}/studio?error=${encodeURIComponent(`${platform} posting isn't set up on the server yet`)}`, 303);
  const saved = (await getStore().listFor("socialAccounts", user.id)).find((a) => a.platform === platform);
  const state = signValue(`${user.id}|${platform}|${saved?.handle ?? ""}|${Date.now()}`);
  return Response.redirect(p.authUrl(state, `${origin}/api/social/${platform}/callback`), 303);
}
