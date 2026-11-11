import { verifySignedValue } from "@/lib/auth";
import { chooseAccount } from "@/lib/poster";
import { provider } from "@/lib/social";
import { siteOrigin } from "@/lib/site";
import { getStore, newId, now } from "@/lib/store";
import { sealToken } from "@/lib/token-box";
import type { SocialPlatform } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const origin = siteOrigin(req);
  const back = (msg: string, ok = false) => Response.redirect(`${origin}/studio?${ok ? "connected" : "error"}=${encodeURIComponent(msg)}`, 303);
  const url = new URL(req.url);
  const p = provider(platform);
  const state = verifySignedValue(url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code");
  if (!p || !state) return back("That sign-in link was invalid or expired. Try connecting again.");
  const [userId, statePlatform, wanted, issued] = state.split("|");
  if (statePlatform !== platform || Date.now() - Number(issued) > 30 * 60_000) return back("That sign-in link expired. Try again.");
  if (!code) return back(url.searchParams.get("error_description") ?? "Sign-in was cancelled.");
  try {
    const found = await p.connect(code, `${origin}/api/social/${platform}/callback`);
    const pick = chooseAccount(found, wanted);
    if ("error" in pick) return back(pick.error);
    const store = getStore();
    const existing = (await store.listFor("socialAccounts", userId)).find((a) => a.platform === platform);
    await store.insert("socialAccounts", {
      id: existing?.id ?? newId("soc"),
      userId,
      platform: platform as SocialPlatform,
      handle: pick.handle.replace(/^@/, ""),
      status: "connected",
      connectedAt: now(),
      externalId: pick.externalId,
      tokenEnc: sealToken(pick.token),
      tokenExpiresAt: pick.expiresAt,
      lastError: null,
    });
    return back(`Connected @${pick.handle.replace(/^@/, "")}`, true);
  } catch (err) {
    return back(err instanceof Error ? err.message : "Connecting failed");
  }
}
