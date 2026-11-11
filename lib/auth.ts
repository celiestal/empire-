import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PremiumFeature, User } from "@/lib/types";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "empire_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set (32+ characters) in production.");
  }
  return "dev-only-secret-change-me-dev-only-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

/** Sign any short value (used for OAuth state). Returns "<value>.<signature>". */
export function signValue(value: string): string {
  return `${value}.${sign(value)}`;
}

export function verifySignedValue(signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const a = Buffer.from(signed.slice(i + 1));
  const b = Buffer.from(sign(value));
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}

/** Session token: "<userId>.<expiresAtMs>.<signature>". */
export function createSessionToken(userId: string, nowMs: number = Date.now()): string {
  const payload = `${userId}.${nowMs + SESSION_DAYS * 86_400_000}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined, nowMs: number = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  const expected = sign(`${userId}.${expires}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < nowMs) return null;
  return userId;
}

export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 86_400;

/** The site owner (OWNER_EMAIL) gets every feature free and runs the agent platform. */
export function isOwner(user: Pick<User, "email"> | null): boolean {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return !!user && !!owner && user.email === owner;
}

export function hasFeature(user: Pick<User, "email" | "plan"> | null, _feature: PremiumFeature): boolean {
  if (!user) return false;
  return isOwner(user) || user.plan === "premium";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
