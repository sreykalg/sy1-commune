import { cookies } from "next/headers";
import type { Session } from "@/lib/types";

export const SESSION_COOKIE = "commune_session";

export function encodeSession(session: Session): string {
  return btoa(JSON.stringify(session))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeSession(value: string | undefined): Session | null {
  if (!value) return null;

  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const parsed = JSON.parse(json) as Session;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.name !== "string" ||
      (parsed.role !== "admin" && parsed.role !== "barista")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value);
}

export function homeForRole(role: Session["role"]): string {
  return role === "admin" ? "/admin" : "/pos";
}
