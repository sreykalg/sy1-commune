"use client";

import { useState, type ReactNode } from "react";
import { UserManager } from "@/components/UserManager";
import type { PublicStaffUser } from "@/lib/users";
import type { Session } from "@/lib/types";

type AdminShellProps = {
  session: Session;
  users: PublicStaffUser[];
  children: ReactNode;
};

export function AdminShell({ session, users, children }: AdminShellProps) {
  const [panel, setPanel] = useState<"sales" | "staff">("sales");

  return (
    <>
      <div className="border-b border-neutral-200 bg-white px-4 py-2 sm:px-6">
        <div className="flex gap-1">
          {(
            [
              ["sales", "Sales"],
              ["staff", "Staff"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPanel(id)}
              className={`rounded-lg px-4 py-2 text-sm ${
                panel === id ? "bg-black text-white" : "text-neutral-600 hover:text-black"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {panel === "sales" ? children : <UserManager users={users} session={session} />}
    </>
  );
}
