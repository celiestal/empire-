import type {
  Agent,
  Approval,
  AuditEvent,
  ContentIdea,
  ContentPost,
  ContentSettings,
  KnowledgeEntry,
  LedgerEntry,
  Opportunity,
  Project,
  Settings,
  SocialAccount,
  Task,
  User,
} from "@/lib/types";
import { DEFAULT_CONTENT_SETTINGS, DEFAULT_SETTINGS } from "@/lib/types";
import { MemoryStore } from "./memory";
import { PostgresStore } from "./postgres";
import { SupabaseStore } from "./supabase";

/** Every collection the platform keeps, and the record type it holds. */
export interface Collections {
  agents: Agent;
  opportunities: Opportunity;
  projects: Project;
  tasks: Task;
  approvals: Approval;
  knowledge: KnowledgeEntry;
  ledger: LedgerEntry;
  audit: AuditEvent;
  socialAccounts: SocialAccount;
  contentIdeas: ContentIdea;
  contentPosts: ContentPost;
  contentProfiles: ContentSettings;
  users: User;
}

export type CollectionName = keyof Collections;

export interface Singletons {
  settings: Settings;
}

/** Low-level persistence. Records are kept as JSON documents keyed by collection and id. */
export interface Backend {
  list<C extends CollectionName>(collection: C): Promise<Collections[C][]>;
  get<C extends CollectionName>(collection: C, id: string): Promise<Collections[C] | null>;
  put<C extends CollectionName>(collection: C, record: Collections[C]): Promise<void>;
  getSingleton<K extends keyof Singletons>(key: K): Promise<Singletons[K] | null>;
  putSingleton<K extends keyof Singletons>(key: K, value: Singletons[K]): Promise<void>;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function now(): string {
  return new Date().toISOString();
}

/** Typed helpers on top of a backend. */
export class Store {
  constructor(private backend: Backend) {}

  async list<C extends CollectionName>(collection: C): Promise<Collections[C][]> {
    const rows = await this.backend.list(collection);
    return rows.sort((a, b) =>
      String((b as { createdAt?: string }).createdAt ?? "").localeCompare(
        String((a as { createdAt?: string }).createdAt ?? ""),
      ),
    );
  }

  get<C extends CollectionName>(collection: C, id: string) {
    return this.backend.get(collection, id);
  }

  async insert<C extends CollectionName>(collection: C, record: Collections[C]): Promise<Collections[C]> {
    await this.backend.put(collection, record);
    return record;
  }

  async update<C extends CollectionName>(
    collection: C,
    id: string,
    patch: Partial<Collections[C]>,
  ): Promise<Collections[C]> {
    const existing = await this.backend.get(collection, id);
    if (!existing) throw new Error(`${collection}/${id} not found`);
    const next = { ...existing, ...patch, id } as Collections[C];
    await this.backend.put(collection, next);
    return next;
  }

  async settings(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...((await this.backend.getSingleton("settings")) ?? {}) };
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.settings()), ...patch };
    await this.backend.putSingleton("settings", next);
    return next;
  }

  /** Records in a collection that belong to one user. */
  async listFor<C extends "socialAccounts" | "contentIdeas" | "contentPosts">(
    collection: C,
    userId: string,
  ): Promise<Collections[C][]> {
    return (await this.list(collection)).filter((r) => r.userId === userId);
  }

  async contentSettings(userId: string): Promise<ContentSettings> {
    return {
      ...DEFAULT_CONTENT_SETTINGS,
      ...((await this.backend.get("contentProfiles", userId)) ?? {}),
      id: userId,
    };
  }

  async updateContentSettings(userId: string, patch: Partial<ContentSettings>): Promise<ContentSettings> {
    const next = { ...(await this.contentSettings(userId)), ...patch, id: userId };
    await this.backend.put("contentProfiles", next);
    return next;
  }

  async userByEmail(email: string): Promise<User | null> {
    const wanted = email.trim().toLowerCase();
    return (await this.backend.list("users")).find((u) => u.email === wanted) ?? null;
  }

  async audit(actor: string, action: string, detail: string): Promise<void> {
    await this.insert("audit", { id: newId("evt"), actor, action, detail, createdAt: now() });
  }
}

let shared: Store | null = null;

/**
 * Postgres when DATABASE_URL is set (e.g. Railway), else Supabase when
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, else an in-memory store
 * (fine for local development; it resets on every restart).
 */
export function getStore(): Store {
  if (shared) return shared;
  const dbUrl = process.env.DATABASE_URL;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (dbUrl) shared = new Store(new PostgresStore(dbUrl));
  else if (url && key) shared = new Store(new SupabaseStore(url, key));
  else {
    if (process.env.NODE_ENV === "production") {
      console.warn("No DATABASE_URL or Supabase settings: data is kept in memory and lost on restart.");
    }
    shared = new Store(MemoryStore.shared());
  }
  return shared;
}
