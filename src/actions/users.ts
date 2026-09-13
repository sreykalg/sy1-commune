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
import { phDateString, phIsoFromDateTimeInput } from "@/lib/datetime";
import { openBaristaShifts } from "@/lib/staff-sessions";
import {
  canUsePos,
  parseRole,
  staffUserId,
  toSession,
} from "@/lib/users";
import { sanitizeLoginGate } from "@/lib/staff-gates";
import type { OffRequest, Role, StaffUser, StoreData } from "@/lib/types";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("Only admin can manage staff.");
  }
  return session;
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/pos");
}

async function requirePosSession() {
  const session = await getSession();
  if (!session || !canUsePos(session.role)) {
    throw new Error("Only cashier or manager can punch barista shifts.");
  }
  return session;
}

function appendPunch(store: StoreData, user: StaffUser, type: "login" | "logout") {
  if (!Array.isArray(store.loginActivity)) store.loginActivity = [];
  store.loginActivity.unshift({
    id: `auth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    type,
    at: new Date().toISOString(),
  });
  if (store.loginActivity.length > 300) store.loginActivity.length = 300;
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
  if (!name) return { error: "Enter a display name." };

  const title =
    role === "barista"
      ? "Barista"
      : input.title.trim() || (role === "admin" ? "Owner" : "Staff");
  const password = input.password;
  const username = (
    input.username.trim() ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, "")
  )
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 32);

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
    if (parsed.password) {
      user.password = parsed.password;
    }
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

export async function punchStaff(userId: string, type: "login" | "logout") {
  await requireAdmin();
  let error: string | undefined;
  await updateStore((store) => {
    const user = store.users.find((entry) => entry.id === userId);
    if (!user || user.role === "admin") {
      error = "Pick a staff member.";
      return;
    }
    appendPunch(store, user, type);
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function punchBaristaShift(input: {
  type: "login" | "logout";
  username?: string;
  password?: string;
  userId?: string;
}) {
  await requirePosSession();

  let error: string | undefined;
  let punchedName: string | undefined;
  await updateStore((store) => {
    const openShifts = openBaristaShifts(store.loginActivity ?? []);

    if (input.type === "login") {
      const username = String(input.username ?? "").trim().toLowerCase();
      const password = String(input.password ?? "");
      const user = store.users.find(
        (entry) => entry.role === "barista" && entry.username === username && entry.password === password,
      );
      if (!user) {
        error = "Barista username or password is incorrect.";
        return;
      }
      if (!user.password) {
        error = "This barista does not have a password yet. Ask admin to set one.";
        return;
      }
      if (openShifts.some((shift) => shift.userId === user.id)) {
        error = `${user.name} is already clocked in.`;
        return;
      }
      appendPunch(store, user, "login");
      punchedName = user.name;
      return;
    }

    const userId = String(input.userId ?? "").trim();
    const open = openShifts.find((shift) => shift.userId === userId) ?? (userId ? null : openShifts[0]);
    if (!open) {
      error = "That barista is not clocked in.";
      return;
    }
    const user = store.users.find((entry) => entry.id === open.userId);
    if (!user) {
      error = "Barista account not found.";
      return;
    }
    appendPunch(store, user, "logout");
    punchedName = user.name;
  });

  if (error) return { error };
  refresh();
  return { ok: true as const, name: punchedName ?? "" };
}

export async function updateStaffSessionTimes(input: {
  loginId?: string;
  loginAt?: string;
  logoutId?: string;
  logoutAt?: string;
}) {
  await requireAdmin();

  if (!input.loginId && !input.logoutId) {
    return { error: "No in / out time was selected." };
  }

  const loginAt = input.loginId ? phIsoFromDateTimeInput(input.loginAt ?? "") : undefined;
  const logoutAt = input.logoutId ? phIsoFromDateTimeInput(input.logoutAt ?? "") : undefined;
  if ((input.loginId && !loginAt) || (input.logoutId && !logoutAt)) {
    return { error: "Enter a valid date and time." };
  }

  let error: string | undefined;
  await updateStore((store) => {
    const login = input.loginId
      ? store.loginActivity.find((entry) => entry.id === input.loginId && entry.type === "login")
      : undefined;
    const logout = input.logoutId
      ? store.loginActivity.find((entry) => entry.id === input.logoutId && entry.type === "logout")
      : undefined;

    if ((input.loginId && !login) || (input.logoutId && !logout)) {
      error = "In / off record not found.";
      return;
    }
    if (login && logout && login.userId !== logout.userId) {
      error = "The in and off records do not belong to the same staff member.";
      return;
    }

    const nextLoginAt = loginAt ?? login?.at;
    const nextLogoutAt = logoutAt ?? logout?.at;
    if (
      nextLoginAt &&
      nextLogoutAt &&
      new Date(nextLogoutAt).getTime() < new Date(nextLoginAt).getTime()
    ) {
      error = "Off time cannot be earlier than in time.";
      return;
    }

    if (login && loginAt) login.at = loginAt;
    if (logout && logoutAt) logout.at = logoutAt;
  });

  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function createOffRequest(input: { userId?: string; date: string; reason: string }) {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const date = phDateString(input.date);
  const reason = input.reason.trim();
  if (!date) return { error: "Pick a date." };
  if (!reason) return { error: "Enter a reason." };

  const asAdmin = session.role === "admin";
  if (!asAdmin && session.role !== "cashier" && session.role !== "manager") {
    return { error: "Only staff can request off." };
  }

  let error: string | undefined;
  await updateStore((store) => {
    const userId = asAdmin ? input.userId : session.userId;
    const user = store.users.find((entry) => entry.id === userId);
    if (!user || user.role === "admin") {
      error = "Pick a staff member.";
      return;
    }
    if (!Array.isArray(store.offRequests)) store.offRequests = [];
    store.offRequests.unshift({
      id: `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      name: user.name,
      date,
      reason,
      status: asAdmin ? "approved" : "pending",
      createdAt: new Date().toISOString(),
    });
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function setOffRequestStatus(id: string, status: OffRequest["status"]) {
  await requireAdmin();
  let error: string | undefined;
  await updateStore((store) => {
    const request = store.offRequests?.find((entry) => entry.id === id);
    if (!request) {
      error = "Request not found.";
      return;
    }
    request.status = status;
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function deleteOffRequest(id: string) {
  await requireAdmin();
  await updateStore((store) => {
    store.offRequests = (store.offRequests ?? []).filter((entry) => entry.id !== id);
  });
  refresh();
  return { ok: true };
}

export async function updateLoginGates(
  adminPath: string,
  cashierPath: string,
): Promise<{ error: string } | { ok: true; admin: string; cashier: string }> {
  await requireAdmin();
  const admin = sanitizeLoginGate(adminPath);
  if (!admin.ok) return { error: admin.error };
  const cashier = sanitizeLoginGate(cashierPath);
  if (!cashier.ok) return { error: cashier.error };
  if (admin.value === cashier.value) {
    return { error: "Use different paths for admin and cashier." };
  }

  let previous = { admin: "", cashier: "" };
  await updateStore((store) => {
    previous = { ...store.loginGates };
    store.loginGates = { admin: admin.value, cashier: cashier.value };
  });
  refresh();
  if (previous.admin) revalidatePath(`/${previous.admin}`);
  if (previous.cashier) revalidatePath(`/${previous.cashier}`);
  revalidatePath(`/${admin.value}`);
  revalidatePath(`/${cashier.value}`);
  return { ok: true, admin: admin.value, cashier: cashier.value };
}
