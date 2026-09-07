"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  SESSION_COOKIE,
  encodeSession,
  getSession,
  sessionCookieOptions,
} from "@/lib/auth";
import { updateStore } from "@/lib/store";
import {
  parseRole,
  staffUserId,
  toSession,
} from "@/lib/users";
import type { Role, StaffUser } from "@/lib/types";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("Only admin can manage staff.");
  }
  return session;
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/login");
}

function parseStaff(input: {
  name: string;
  username: string;
  title: string;
  role: string;
  password: string;
  requirePassword: boolean;
}): { error: string } | { name: string; username: string; title: string; role: Role; password?: string } {
  const name = input.name.trim();
  const role = parseRole(input.role);
  const title = input.title.trim() || (role === "admin" ? "Owner" : "Barista");
  const password = input.password;
  const username = (
    input.username.trim() ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, "")
  )
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 32);

  if (!name) return { error: "Enter a display name." };
  if (!username || username.length < 2) {
    return { error: "Enter a username (letters and numbers)." };
  }
  if (input.requirePassword && password.length < 4) {
    return { error: "Password must be at least 4 characters." };
  }
  if (!input.requirePassword && password && password.length < 4) {
    return { error: "Password must be at least 4 characters." };
  }

  return {
    name,
    username,
    title,
    role,
    password: password ? password : undefined,
  };
}

export async function createStaffUser(input: {
  name: string;
  username: string;
  title: string;
  role: string;
  password: string;
}) {
  await requireAdmin();
  const parsed = parseStaff({ ...input, requirePassword: true });
  if ("error" in parsed) return parsed;

  let error: string | undefined;
  await updateStore((store) => {
    if (!Array.isArray(store.users)) store.users = [];
    const taken = store.users.some(
      (user) => user.username === parsed.username,
    );
    if (taken) {
      error = "That username is already in use.";
      return;
    }
    store.users.push({
      id: staffUserId(parsed.username),
      name: parsed.name,
      username: parsed.username,
      title: parsed.title,
      role: parsed.role,
      password: parsed.password ?? "",
    });
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function updateStaffUser(input: {
  id: string;
  name: string;
  username: string;
  title: string;
  role: string;
  password: string;
}) {
  const session = await requireAdmin();
  const parsed = parseStaff({ ...input, requirePassword: false });
  if ("error" in parsed) return parsed;

  let error: string | undefined;
  let nextUser: StaffUser | undefined;

  await updateStore((store) => {
    const user = store.users.find((entry) => entry.id === input.id);
    if (!user) {
      error = "Staff account not found.";
      return;
    }
    const taken = store.users.some(
      (entry) => entry.id !== input.id && entry.username === parsed.username,
    );
    if (taken) {
      error = "That username is already in use.";
      return;
    }
    const admins = store.users.filter((entry) => entry.role === "admin");
    if (
      user.role === "admin" &&
      parsed.role !== "admin" &&
      admins.length < 2
    ) {
      error = "Keep at least one admin account.";
      return;
    }
    user.name = parsed.name;
    user.username = parsed.username;
    user.title = parsed.title;
    user.role = parsed.role;
    if (parsed.password) user.password = parsed.password;
    nextUser = { ...user };
  });

  if (error) return { error };

  if (nextUser && session.userId === nextUser.id) {
    const jar = await cookies();
    jar.set(SESSION_COOKIE, encodeSession(toSession(nextUser)), sessionCookieOptions());
  }

  refresh();
  return { ok: true };
}

export async function deleteStaffUser(id: string) {
  const session = await requireAdmin();
  if (session.userId === id) {
    return { error: "You cannot delete the account you are using." };
  }

  let error: string | undefined;
  await updateStore((store) => {
    const user = store.users.find((entry) => entry.id === id);
    if (!user) {
      error = "Staff account not found.";
      return;
    }
    const admins = store.users.filter((entry) => entry.role === "admin");
    if (user.role === "admin" && admins.length < 2) {
      error = "Keep at least one admin account.";
      return;
    }
    store.users = store.users.filter((entry) => entry.id !== id);
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}
