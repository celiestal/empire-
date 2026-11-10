import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Backend, CollectionName, Collections, Singletons } from "./index";

/**
 * Postgres-backed store via Supabase. Uses the `records` table from
 * supabase/migrations/0001_init.sql. Server-side only: it needs the service role key.
 */
export class SupabaseStore implements Backend {
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async list<C extends CollectionName>(collection: C): Promise<Collections[C][]> {
    const { data, error } = await this.db
      .from("records")
      .select("data")
      .eq("collection", collection)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(`list ${collection}: ${error.message}`);
    return (data ?? []).map((r) => r.data as Collections[C]);
  }

  async get<C extends CollectionName>(collection: C, id: string): Promise<Collections[C] | null> {
    const { data, error } = await this.db
      .from("records")
      .select("data")
      .eq("collection", collection)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`get ${collection}/${id}: ${error.message}`);
    return (data?.data as Collections[C]) ?? null;
  }

  async put<C extends CollectionName>(collection: C, record: Collections[C]): Promise<void> {
    const { error } = await this.db
      .from("records")
      .upsert({ collection, id: record.id, data: record, updated_at: new Date().toISOString() });
    if (error) throw new Error(`put ${collection}/${record.id}: ${error.message}`);
  }

  async getSingleton<K extends keyof Singletons>(key: K): Promise<Singletons[K] | null> {
    const { data, error } = await this.db
      .from("records")
      .select("data")
      .eq("collection", "_singleton")
      .eq("id", key)
      .maybeSingle();
    if (error) throw new Error(`get ${key}: ${error.message}`);
    return (data?.data as Singletons[K]) ?? null;
  }

  async putSingleton<K extends keyof Singletons>(key: K, value: Singletons[K]): Promise<void> {
    const { error } = await this.db
      .from("records")
      .upsert({ collection: "_singleton", id: key, data: value, updated_at: new Date().toISOString() });
    if (error) throw new Error(`put ${key}: ${error.message}`);
  }
}
