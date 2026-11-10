import { Pool } from "pg";
import type { Backend, CollectionName, Collections, Singletons } from "./index";

/**
 * Plain Postgres store (for example Railway's Postgres, via DATABASE_URL).
 * Creates the `records` table on first use, same shape as the Supabase migration.
 */
export class PostgresStore implements Backend {
  private pool: Pool;
  private ready: Promise<void> | null = null;

  constructor(connectionString: string) {
    const local = /localhost|127\.0\.0\.1|\.railway\.internal/.test(connectionString);
    this.pool = new Pool({ connectionString, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } });
  }

  private init(): Promise<void> {
    this.ready ??= this.pool
      .query(
        `create table if not exists records (
           collection text not null,
           id text not null,
           data jsonb not null,
           created_at timestamptz not null default now(),
           updated_at timestamptz not null default now(),
           primary key (collection, id)
         );
         create index if not exists records_collection_created_idx on records (collection, created_at desc);`,
      )
      .then(() => undefined)
      .catch((err) => {
        this.ready = null;
        throw err;
      });
    return this.ready;
  }

  private async q<T>(sql: string, params: unknown[]): Promise<T[]> {
    await this.init();
    return (await this.pool.query(sql, params)).rows as T[];
  }

  async list<C extends CollectionName>(collection: C): Promise<Collections[C][]> {
    const rows = await this.q<{ data: Collections[C] }>(
      "select data from records where collection = $1 order by created_at desc limit 1000",
      [collection],
    );
    return rows.map((r) => r.data);
  }

  async get<C extends CollectionName>(collection: C, id: string): Promise<Collections[C] | null> {
    const rows = await this.q<{ data: Collections[C] }>("select data from records where collection = $1 and id = $2", [collection, id]);
    return rows[0]?.data ?? null;
  }

  async put<C extends CollectionName>(collection: C, record: Collections[C]): Promise<void> {
    await this.q(
      `insert into records (collection, id, data) values ($1, $2, $3)
       on conflict (collection, id) do update set data = excluded.data, updated_at = now()`,
      [collection, record.id, JSON.stringify(record)],
    );
  }

  async getSingleton<K extends keyof Singletons>(key: K): Promise<Singletons[K] | null> {
    const rows = await this.q<{ data: Singletons[K] }>("select data from records where collection = '_singleton' and id = $1", [key]);
    return rows[0]?.data ?? null;
  }

  async putSingleton<K extends keyof Singletons>(key: K, value: Singletons[K]): Promise<void> {
    await this.q(
      `insert into records (collection, id, data) values ('_singleton', $1, $2)
       on conflict (collection, id) do update set data = excluded.data, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
}
