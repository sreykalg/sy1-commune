import type { Role, Session } from "@/lib/types";

type UserRecord = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  title: string;
};

export const USERS: UserRecord[] = [
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

export function findUser(
  username: string,
  password: string,
): UserRecord | undefined {
  return USERS.find(
    (user) => user.username === username && user.password === password,
  );
}

export function toSession(user: UserRecord): Session {
  return {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
}
