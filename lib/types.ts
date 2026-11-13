// Core domain types for the Empire platform.

export type RoleId =
  | "ceo"
  | "market_research"
  | "business_development"
  | "product_development"
  | "marketing"
  | "sales"
  | "finance"
  | "operations"
  | "legal_compliance"
  | "customer_relations"
  | "innovation"
  | "custom";

export interface Agent {
  id: string;
  role: RoleId;
  name: string;
  mission: string;
  parentId: string | null;
  status: "active" | "retired";
  createdAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  summary: string;
  market: string;
  startupCostCents: number;
  monthlyRevenueEstimateCents: number;
  /** 1 (low) to 5 (high) */
  risk: number;
  /** Risk-adjusted score, computed by the platform, not the model. */
  score: number;
  status: "proposed" | "selected" | "rejected";
  createdBy: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  goal: string;
  opportunityId: string | null;
  status: "planning" | "active" | "paused" | "done";
  budgetCents: number;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string | null;
  agentId: string;
  description: string;
  status: "queued" | "running" | "done" | "failed";
  result: string | null;
  createdAt: string;
}

/** Anything that leaves the system or costs money must go through an approval. */
export type GatedActionKind = "spend" | "outreach" | "deploy" | "contract" | "publish";

export interface Approval {
  id: string;
  kind: GatedActionKind;
  summary: string;
  detail: string;
  amountCents: number;
  projectId: string | null;
  requestedBy: string;
  status: "pending" | "approved" | "rejected" | "executed";
  createdAt: string;
  decidedAt: string | null;
}

export interface KnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  agentId: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  projectId: string | null;
  /** Positive = revenue, negative = expense. */
  amountCents: number;
  description: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface Settings {
  /** When on, agents may only read and think; every write and gated action is refused. */
  killSwitch: boolean;
  monthlyBudgetCents: number;
  perActionLimitCents: number;
  /** The owner's goals, in their words. Fed to the CEO Agent every cycle. */
  ownerGoals: string;
}

export const DEFAULT_SETTINGS: Settings = {
  killSwitch: false,
  monthlyBudgetCents: 0,
  perActionLimitCents: 0,
  ownerGoals:
    "Build legitimate, profitable online businesses. Start small, prove revenue, then expand.",
};

// ---------------------------------------------------------------------------
// Content Studio: plan short videos, generate scripts and hashtags, post them.
// ---------------------------------------------------------------------------

export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "youtube" | "x" | "linkedin";

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram Reels" },
  { id: "facebook", label: "Facebook Reels" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube Shorts" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
];

export interface SocialAccount {
  id: string;
  userId: string;
  platform: SocialPlatform;
  handle: string;
  /** "connected" only once a real OAuth token is stored server-side. */
  status: "connected" | "pending" | "disconnected";
  connectedAt: string | null;
  /** The platform's own id for the connected account or page. */
  externalId?: string;
  /** Access or refresh token, encrypted with AUTH_SECRET. Never sent to the browser. */
  tokenEnc?: string;
  tokenExpiresAt?: string | null;
  lastError?: string | null;
}

/** One line on the content gap list: a question the audience asks that nobody answers well. */
export interface ContentIdea {
  id: string;
  userId: string;
  question: string;
  source: string;
  /** How many times this question has come up. Higher = pick sooner. */
  asks: number;
  status: "open" | "planned" | "used";
  createdAt: string;
}

export type PostStatus = "idea" | "scripted" | "filmed" | "scheduled" | "posted";

export interface VideoScript {
  hookOptions: string[];
  hook: string;
  setup: string;
  valuePoints: string[];
  close: string;
}

export interface ContentPost {
  id: string;
  userId: string;
  ideaId: string | null;
  topic: string;
  script: VideoScript | null;
  caption: string;
  hashtags: string[];
  platforms: SocialPlatform[];
  /** ISO date (YYYY-MM-DD) the post goes live. */
  scheduledFor: string | null;
  status: PostStatus;
  approvalId: string | null;
  createdAt: string;
  /** Public URL of the finished vertical video (stored in Vercel Blob). */
  videoUrl?: string | null;
  /** When on, the autopilot posts this on its scheduled day to every connected account in `platforms`. */
  autoPost?: boolean;
  /** Scripts from the writer sub-agents, one per angle. */
  scriptVariants?: ScriptVariant[];
  /** What happened on each platform when the post went out. */
  postResults?: PostResult[];
}

export interface ScriptVariant {
  angle: string;
  script: VideoScript;
  caption: string;
  hashtags: string[];
}

export interface PostResult {
  platform: SocialPlatform;
  ok: boolean;
  /** The platform's id for the published post. */
  externalId?: string;
  error?: string;
  at: string;
}

/** A headline found by the news scouts. */
export interface NewsItem {
  id: string;
  kind: "ai" | "business";
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  /** True once the idea agent has looked at it. */
  used: boolean;
  createdAt: string;
}

/** One autopilot run, for the activity log. */
/** Someone asking to hire the owner's done-for-you video editing service. */
export interface Lead {
  id: string;
  name: string;
  email: string;
  business: string;
  packageId: string;
  message: string;
  status: "new" | "contacted" | "won" | "lost";
  createdAt: string;
}

export interface AutopilotRun {
  id: string;
  lines: string[];
  createdAt: string;
}

export interface ContentSettings {
  /** Same as the user's id: one content profile per user. */
  id: string;
  brandTag: string;
  nicheTags: string[];
  audience: string;
  /** 0 = Sunday ... 6 = Saturday */
  postingDays: number[];
  planningDay: number;
  filmingDay: number;
  targetSeconds: number;
  maxSeconds: number;
  /** When on, the daily autopilot finds news, adds ideas, plans the week, writes scripts and posts. */
  autopilot?: boolean;
}

export const DEFAULT_CONTENT_SETTINGS: Omit<ContentSettings, "id"> = {
  brandTag: "#Empire",
  nicheTags: ["#SmallBusinessTips"],
  audience: "people who want to start an online business",
  postingDays: [1, 3, 5],
  planningDay: 0,
  filmingDay: 1,
  targetSeconds: 60,
  maxSeconds: 120,
};

// ---------------------------------------------------------------------------
// Accounts and plans
// ---------------------------------------------------------------------------

export type Plan = "free" | "premium";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  plan: Plan;
  stripeCustomerId: string | null;
  createdAt: string;
}

/** Features that need Premium. Everything else in the Content Studio is free. */
export type PremiumFeature = "ai_content" | "auto_edit";
