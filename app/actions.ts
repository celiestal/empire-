"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createSessionToken,
  hasFeature,
  hashPassword,
  normalizeEmail,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  validEmail,
  verifyPassword,
} from "@/lib/auth";
import { billingEnabled, createCheckoutUrl, createPortalUrl } from "@/lib/billing";
import { aiEnabled } from "@/lib/ai";
import { accountsOpen } from "@/lib/env";
import { buildHashtags, hashtagProblems, upcomingWeek } from "@/lib/content";
import { generateContent } from "@/lib/content-ai";
import { ideaStarters, templateContent } from "@/lib/content-free";
import { runCeoCycle } from "@/lib/agents/runtime";
import { requireOwner, requireUser } from "@/lib/session";
import { getStore, newId, now } from "@/lib/store";
import type { PostStatus, SocialPlatform } from "@/lib/types";
import { SOCIAL_PLATFORMS } from "@/lib/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return process.env.PUBLIC_URL ?? `${proto}://${host}`;
}

async function startSession(userId: string) {
  (await cookies()).set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

// --- Accounts ---------------------------------------------------------------

export async function signUp(fd: FormData) {
  if (!accountsOpen()) redirect("/signup");
  const email = normalizeEmail(str(fd, "email"));
  const password = str(fd, "password");
  if (!validEmail(email)) redirect("/signup?error=Enter+a+valid+email");
  if (password.length < 8) redirect("/signup?error=Use+at+least+8+characters");
  const store = getStore();
  if (await store.userByEmail(email)) redirect("/login?error=That+email+already+has+an+account");
  const user = await store.insert("users", {
    id: newId("usr"),
    email,
    passwordHash: await hashPassword(password),
    plan: "free",
    stripeCustomerId: null,
    createdAt: now(),
  });
  await store.audit(email, "signed_up", "");
  await startSession(user.id);
  redirect("/studio");
}

export async function logIn(fd: FormData) {
  const email = normalizeEmail(str(fd, "email"));
  const user = await getStore().userByEmail(email);
  if (!user || !(await verifyPassword(str(fd, "password"), user.passwordHash))) {
    redirect("/login?error=Wrong+email+or+password");
  }
  await startSession(user.id);
  redirect("/studio");
}

export async function logOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function startCheckout() {
  const user = await requireUser();
  if (!billingEnabled()) redirect("/pricing?error=Payments+are+not+switched+on+yet");
  const url = await createCheckoutUrl({
    userId: user.id,
    email: user.email,
    customerId: user.stripeCustomerId,
    origin: await origin(),
  });
  redirect(url);
}

export async function openBillingPortal() {
  const user = await requireUser();
  if (!user.stripeCustomerId || !billingEnabled()) redirect("/account");
  redirect(await createPortalUrl(user.stripeCustomerId, await origin()));
}

// --- Content Studio ---------------------------------------------------------

export async function saveContentSettings(fd: FormData) {
  const user = await requireUser();
  const days = fd.getAll("postingDays").map(Number).filter((d) => d >= 0 && d <= 6);
  await getStore().updateContentSettings(user.id, {
    brandTag: str(fd, "brandTag") || "#Empire",
    nicheTags: str(fd, "nicheTags").split(/[\s,]+/).filter(Boolean).slice(0, 2),
    audience: str(fd, "audience"),
    postingDays: days.length ? days : [1, 3, 5],
    planningDay: Number(str(fd, "planningDay") || 0),
    filmingDay: Number(str(fd, "filmingDay") || 1),
  });
  revalidatePath("/studio");
}

export async function addIdea(fd: FormData) {
  const user = await requireUser();
  const question = str(fd, "question");
  if (!question) return;
  await getStore().insert("contentIdeas", {
    id: newId("idea"),
    userId: user.id,
    question,
    source: str(fd, "source") || "manual",
    asks: 1,
    status: "open",
    createdAt: now(),
  });
  revalidatePath("/studio");
}

export async function bumpIdea(fd: FormData) {
  const user = await requireUser();
  const store = getStore();
  const idea = await store.get("contentIdeas", str(fd, "id"));
  if (!idea || idea.userId !== user.id) return;
  await store.update("contentIdeas", idea.id, { asks: idea.asks + 1 });
  revalidatePath("/studio");
}

/** Plan the coming week: turn the top ideas into posts on the posting days. */
export async function planWeek() {
  const user = await requireUser();
  const store = getStore();
  const settings = await store.contentSettings(user.id);
  const week = upcomingWeek(settings);
  const ideas = (await store.listFor("contentIdeas", user.id))
    .filter((i) => i.status === "open")
    .sort((a, b) => b.asks - a.asks || a.createdAt.localeCompare(b.createdAt))
    .slice(0, week.posts.length);
  for (const [i, idea] of ideas.entries()) {
    await store.insert("contentPosts", {
      id: newId("post"),
      userId: user.id,
      ideaId: idea.id,
      topic: idea.question,
      script: null,
      caption: "",
      hashtags: buildHashtags([], settings),
      platforms: ["instagram", "facebook"],
      scheduledFor: week.posts[i],
      status: "idea",
      approvalId: null,
      createdAt: now(),
    });
    await store.update("contentIdeas", idea.id, { status: "planned" });
  }
  revalidatePath("/studio");
}

export async function createPost(fd: FormData) {
  const user = await requireUser();
  const store = getStore();
  const settings = await store.contentSettings(user.id);
  const topic = str(fd, "topic");
  if (!topic) return;
  const post = await store.insert("contentPosts", {
    id: newId("post"),
    userId: user.id,
    ideaId: null,
    topic,
    script: null,
    caption: "",
    hashtags: buildHashtags([], settings),
    platforms: ["instagram", "facebook"],
    scheduledFor: str(fd, "scheduledFor") || null,
    status: "idea",
    approvalId: null,
    createdAt: now(),
  });
  redirect(`/studio/posts/${post.id}`);
}

export async function generateForPost(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  if (!hasFeature(user, "ai_content")) redirect(`/pricing?from=ai`);
  if (!aiEnabled()) redirect(`/studio/posts/${id}?error=AI+is+not+set+up+on+this+server+yet`);
  const store = getStore();
  const post = await store.get("contentPosts", id);
  if (!post || post.userId !== user.id) redirect("/studio");
  const settings = await store.contentSettings(user.id);
  let errorMsg = "";
  try {
    const g = await generateContent(post.topic, settings);
    await store.update("contentPosts", id, {
      script: g.script,
      caption: g.caption,
      hashtags: g.hashtags,
      status: post.status === "idea" ? "scripted" : post.status,
    });
    await store.audit(user.email, "generated_script", post.topic);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Generation failed";
  }
  redirect(`/studio/posts/${id}${errorMsg ? `?error=${encodeURIComponent(errorMsg)}` : ""}`);
}

/** Free script writer: fills the post from templates, no paid AI. Open to every plan. */
export async function writeFreeScript(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  const store = getStore();
  const post = await store.get("contentPosts", id);
  if (!post || post.userId !== user.id) redirect("/studio");
  const settings = await store.contentSettings(user.id);
  const variant = post.script ? Math.floor(Math.random() * 1000) : 0;
  const g = templateContent(post.topic, settings, variant);
  await store.update("contentPosts", id, {
    script: g.script,
    caption: g.caption,
    hashtags: g.hashtags,
    status: post.status === "idea" ? "scripted" : post.status,
  });
  redirect(`/studio/posts/${id}?saved=1`);
}

/** Add starter questions for the user's niche to the idea list, skipping ones already there. */
export async function suggestIdeas() {
  const user = await requireUser();
  const store = getStore();
  const settings = await store.contentSettings(user.id);
  const existing = new Set((await store.listFor("contentIdeas", user.id)).map((i) => i.question.toLowerCase()));
  for (const question of ideaStarters(settings)) {
    if (existing.has(question.toLowerCase())) continue;
    await store.insert("contentIdeas", {
      id: newId("idea"),
      userId: user.id,
      question,
      source: "starter",
      asks: 1,
      status: "open",
      createdAt: now(),
    });
  }
  revalidatePath("/studio");
}

export async function savePost(fd: FormData) {
  const user = await requireUser();
  const store = getStore();
  const id = str(fd, "id");
  const post = await store.get("contentPosts", id);
  if (!post || post.userId !== user.id) redirect("/studio");
  const settings = await store.contentSettings(user.id);
  const hashtags = buildHashtags(str(fd, "hashtags").split(/[\s,]+/), { brandTag: "", nicheTags: [] });
  const problems = hashtagProblems(hashtags);
  const platforms = fd
    .getAll("platforms")
    .map(String)
    .filter((p): p is SocialPlatform => SOCIAL_PLATFORMS.some((s) => s.id === p));
  const script = post.script
    ? {
        ...post.script,
        hook: str(fd, "hook") || post.script.hook,
        setup: str(fd, "setup"),
        valuePoints: [str(fd, "value0"), str(fd, "value1"), str(fd, "value2")].filter(Boolean),
        close: str(fd, "close"),
      }
    : null;
  await store.update("contentPosts", id, {
    topic: str(fd, "topic") || post.topic,
    caption: str(fd, "caption"),
    hashtags: hashtags.length ? hashtags : buildHashtags([], settings),
    platforms,
    scheduledFor: str(fd, "scheduledFor") || null,
    status: (str(fd, "status") as PostStatus) || post.status,
    script,
  });
  const q = problems.length ? `?error=${encodeURIComponent(problems.join(" "))}` : "?saved=1";
  redirect(`/studio/posts/${id}${q}`);
}

export async function connectAccount(fd: FormData) {
  const user = await requireUser();
  const platform = str(fd, "platform") as SocialPlatform;
  if (!SOCIAL_PLATFORMS.some((p) => p.id === platform)) return;
  const handle = str(fd, "handle").replace(/^@/, "");
  if (!handle) return;
  const store = getStore();
  const existing = (await store.listFor("socialAccounts", user.id)).find((a) => a.platform === platform);
  const record = {
    id: existing?.id ?? newId("soc"),
    userId: user.id,
    platform,
    handle,
    // Real posting needs OAuth with each platform's developer app; until that is
    // set up the account is saved as "pending".
    status: "pending" as const,
    connectedAt: null,
  };
  await store.insert("socialAccounts", record);
  revalidatePath("/studio");
}

// --- Owner dashboard --------------------------------------------------------

export async function saveOwnerSettings(fd: FormData) {
  await requireOwner();
  const dollars = (k: string) => Math.max(0, Math.round(Number(str(fd, k) || 0) * 100));
  await getStore().updateSettings({
    ownerGoals: str(fd, "ownerGoals"),
    monthlyBudgetCents: dollars("monthlyBudget"),
    perActionLimitCents: dollars("perActionLimit"),
  });
  revalidatePath("/dashboard");
}

export async function toggleKillSwitch() {
  const owner = await requireOwner();
  const store = getStore();
  const s = await store.settings();
  await store.updateSettings({ killSwitch: !s.killSwitch });
  await store.audit(owner.email, s.killSwitch ? "kill_switch_off" : "kill_switch_on", "");
  revalidatePath("/dashboard");
}

export async function decideApproval(fd: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const approval = await store.get("approvals", str(fd, "id"));
  if (!approval || approval.status !== "pending") return;
  const approve = str(fd, "decision") === "approve";
  await store.update("approvals", approval.id, {
    status: approve ? "approved" : "rejected",
    decidedAt: now(),
  });
  if (approve && approval.kind === "spend" && approval.amountCents > 0) {
    // Record the commitment so the budget reflects it. Paying the vendor is still done by the owner.
    await store.insert("ledger", {
      id: newId("led"),
      projectId: approval.projectId,
      amountCents: -approval.amountCents,
      description: approval.summary,
      createdAt: now(),
    });
  }
  await store.audit(owner.email, approve ? "approved" : "rejected", approval.summary);
  revalidatePath("/dashboard");
}

export async function runCycleNow(fd: FormData) {
  await requireOwner();
  if (!aiEnabled()) redirect("/dashboard?error=Set+ANTHROPIC_API_KEY+to+run+the+agents");
  const result = await runCeoCycle(getStore(), str(fd, "note") || undefined);
  redirect(`/dashboard?${result.refused ? `error=${encodeURIComponent(result.refused)}` : "ran=1"}`);
}
