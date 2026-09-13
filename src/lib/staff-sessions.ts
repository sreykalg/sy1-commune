import type { LoginActivity, Role } from "@/lib/types";

export type StaffSession = {
  id: string;
  userId: string;
  username: string;
  name: string;
  role: Role;
  loginId: string | null;
  logoutId: string | null;
  loginAt: string | null;
  logoutAt: string | null;
};

export function pairLoginSessions(records: LoginActivity[]): StaffSession[] {
  const chronological = [...records].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  );
  const openByUser = new Map<string, StaffSession[]>();
  const sessions: StaffSession[] = [];

  for (const record of chronological) {
    const open = openByUser.get(record.userId) ?? [];
    if (record.type === "login") {
      const session: StaffSession = {
        id: record.id,
        userId: record.userId,
        username: record.username,
        name: record.name,
        role: record.role,
        loginId: record.id,
        logoutId: null,
        loginAt: record.at,
        logoutAt: null,
      };
      sessions.push(session);
      open.push(session);
      openByUser.set(record.userId, open);
    } else {
      const unpaired = open.pop();
      if (unpaired) {
        unpaired.logoutId = record.id;
        unpaired.logoutAt = record.at;
      } else {
        sessions.push({
          id: record.id,
          userId: record.userId,
          username: record.username,
          name: record.name,
          role: record.role,
          loginId: null,
          logoutId: record.id,
          loginAt: null,
          logoutAt: record.at,
        });
      }
    }
  }

  return sessions.sort((a, b) => {
    const aTime = a.loginAt ?? a.logoutAt ?? "";
    const bTime = b.loginAt ?? b.logoutAt ?? "";
    return bTime.localeCompare(aTime);
  });
}

export function openBaristaShifts(records: LoginActivity[]): StaffSession[] {
  return pairLoginSessions(records).filter((session) => session.role === "barista" && !session.logoutAt);
}
