/** Where the site is running and what it can do there. */

/** The auto editor needs ffmpeg, which Vercel functions don't have. */
export function editorAvailable(): boolean {
  if (process.env.EDITOR_ENABLED === "on") return true;
  if (process.env.EDITOR_ENABLED === "off") return false;
  return !process.env.VERCEL;
}

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export function databaseConfigured(): boolean {
  return !!databaseUrl() || !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Accounts need a real database in production; in-memory data would vanish. */
export function accountsOpen(): boolean {
  return databaseConfigured() || process.env.NODE_ENV !== "production";
}
