"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "@/actions/auth";

const ROLES = [
  {
    id: "admin",
    label: "Admin",
    username: "admin",
    note: "Sales and staff",
  },
  {
    id: "barista",
    label: "Barista",
    username: "barista",
    note: "POS only",
  },
] as const;

const initial: LoginState = {};

const field =
  "w-full rounded-none border border-white/30 bg-transparent px-4 py-3 text-white outline-none focus:border-white";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  const [role, setRole] = useState<(typeof ROLES)[number]["id"]>("barista");
  const selected = ROLES.find((item) => item.id === role) ?? ROLES[1];

  return (
    <form action={action} className="w-full max-w-md space-y-6">
      <div className="grid grid-cols-2 gap-2">
        {ROLES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setRole(item.id)}
            className={`rounded-full border px-4 py-3 text-sm transition ${
              role === item.id
                ? "border-white bg-white text-black"
                : "border-white/40 text-white hover:border-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-center text-sm text-neutral-400">{selected.note}</p>

      <label className="block text-left text-sm">
        <span className="mb-2 block tracking-wide text-neutral-400 uppercase">
          Username
        </span>
        <input
          key={selected.username}
          name="username"
          defaultValue={selected.username}
          autoComplete="username"
          className={field}
        />
      </label>

      <label className="block text-left text-sm">
        <span className="mb-2 block tracking-wide text-neutral-400 uppercase">
          Password
        </span>
        <input
          name="password"
          type="password"
          defaultValue="commune"
          autoComplete="current-password"
          className={field}
        />
      </label>

      {state?.error ? (
        <p className="text-sm text-red-300">{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-white py-3 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Enter commune"}
      </button>
    </form>
  );
}
