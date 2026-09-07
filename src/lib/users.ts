import type { Role, Session, StaffUser } from "@/lib/types";

export type PublicStaffUser = Omit<StaffUser, "password">;

export const DEFAULT_USERS: StaffUser[] = [
  {
    id: "admin-1",
    username: "admin",
    password: "commune",
    name: "Admin",
    role: "admin",
    title: "Owner",
  },
  {
    id: "barista-1",
    username: "barista",
    password: "commune",
    name: "Sale In Charge",
    role: "barista",
    title: "Sale In Charge",
  },
];

export function staffUserId(username: string): string {
  const slug = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "user"}-${Date.now().toString(36)}`;
}

export function toSession(user: StaffUser): Session {
  return {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
}

export function publicUser(user: StaffUser): PublicStaffUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    title: user.title,
  };
}

export function parseRole(value: string): Role {
  return value === "admin" ? "admin" : "barista";
}
