import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isOwner, readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type { User } from "@/lib/types";

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return getStore().get("users", userId);
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwner(): Promise<User> {
  const user = await requireUser();
  if (!isOwner(user)) redirect("/studio");
  return user;
}
