"use client";

import { useState, useTransition } from "react";
import {
  createStaffUser,
  deleteStaffUser,
  updateStaffUser,
} from "@/actions/users";
import type { PublicStaffUser } from "@/lib/users";
import type { Session } from "@/lib/types";

const field =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black";

type UserManagerProps = {
  users: PublicStaffUser[];
  session: Session;
};

export function UserManager({ users, session }: UserManagerProps) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<"admin" | "barista">("barista");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editing = users.find((user) => user.id === editingId) ?? null;

  function startCreate() {
    setEditingId("new");
    setName("");
    setUsername("");
    setTitle("");
    setRole("barista");
    setPassword("");
    setNotice(null);
  }

  function startEdit(user: PublicStaffUser) {
    setEditingId(user.id);
    setName(user.name);
    setUsername(user.username);
    setTitle(user.title);
    setRole(user.role);
    setPassword("");
    setNotice(null);
  }

  function resetForm() {
    setEditingId(null);
    setPassword("");
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase">
            Staff
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Manage users
          </h1>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-full bg-black px-5 py-2.5 text-sm text-white"
        >
          Add staff
        </button>
      </div>

      {editingId ? (
        <form
          className="space-y-3 border border-neutral-200 bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const payload = { name, username, title, role, password };
              const result =
                editingId === "new"
                  ? await createStaffUser(payload)
                  : await updateStaffUser({ id: editingId, ...payload });
              if (result && "error" in result && result.error) {
                setNotice(result.error);
                return;
              }
              setNotice(editingId === "new" ? "Staff added." : "Account updated.");
              resetForm();
            });
          }}
        >
          <p className="text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
            {editingId === "new" ? "New account" : `Edit ${editing?.name ?? "account"}`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-neutral-500">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={field}
                placeholder="Sale In Charge"
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-neutral-500">Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={field}
                placeholder="login name"
                autoComplete="off"
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-neutral-500">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={field}
                placeholder="Barista"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-neutral-500">
                {editingId === "new" ? "Password" : "New password"}
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={field}
                placeholder={editingId === "new" ? "at least 4 characters" : "Leave blank to keep"}
                autoComplete="new-password"
                required={editingId === "new"}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["barista", "admin"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setRole(id)}
                className={`rounded-xl border py-2 text-sm capitalize ${
                  role === id
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white"
                }`}
              >
                {id}
              </button>
            ))}
          </div>
          {notice ? (
            <p className="text-sm text-red-600">{notice}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-black px-5 py-2 text-sm text-white disabled:opacity-40"
            >
              {editingId === "new" ? "Add" : "Save"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-neutral-300 px-5 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {!editingId && notice ? (
        <p className="text-sm text-neutral-600">{notice}</p>
      ) : null}

      <ul className="space-y-2">
        {users.map((user) => (
          <li
            key={user.id}
            className="flex items-center gap-3 border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user.name}
                {user.id === session.userId ? (
                  <span className="ml-2 text-xs text-neutral-400">you</span>
                ) : null}
              </p>
              <p className="text-xs text-neutral-500">
                {user.username} · {user.role} · {user.title}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Edit ${user.name}`}
              onClick={() => startEdit(user)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-black"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                <path
                  d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path d="M13.5 6.5l3 3" strokeWidth="1.7" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={`Delete ${user.name}`}
              disabled={pending || user.id === session.userId}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteStaffUser(user.id);
                  if ("error" in result) {
                    setNotice(result.error ?? "Could not delete.");
                    return;
                  }
                  if (editingId === user.id) resetForm();
                  setNotice("Account deleted.");
                })
              }
              className="flex h-8 w-8 items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" strokeWidth="1.7" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
