"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CAFE } from "@/lib/cafe";
import type { Session } from "@/lib/types";

type SiteNavProps = {
  session: Session | null;
};

const ghost =
  "rounded-full px-4 py-2 text-[11px] font-medium tracking-[0.2em] text-white/90 uppercase transition hover:bg-white/15 sm:px-5";

export function SiteNav({ session }: SiteNavProps) {
  const [open, setOpen] = useState(false);
  const staffHref = session
    ? session.role === "admin"
      ? "/admin"
      : "/pos"
    : "/login";
  const staffLabel = session
    ? session.role === "admin"
      ? "Dashboard"
      : "POS"
    : "Login";

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = [
    { href: "/#about", label: "About Us" },
    { href: "/#menu", label: "Menu" },
    { href: "/#contact", label: "Contact Us" },
  ];

  return (
    <header className="absolute inset-x-0 top-0 z-30 px-4 pt-4 sm:pt-7">
      <nav className="mx-auto hidden max-w-5xl items-center justify-center md:flex">
        <div className="flex items-center gap-0.5 rounded-full border border-white/25 bg-black/35 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <Link
            href="/"
            className="shrink-0 px-5 py-2 text-sm font-bold tracking-tight lowercase text-white"
          >
            {CAFE.name}
          </Link>
          <span className="h-4 w-px bg-white/25" />
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={ghost}>
              {link.label}
            </Link>
          ))}
          <Link
            href={staffHref}
            className="shrink-0 rounded-full bg-white px-5 py-2 text-[11px] font-semibold tracking-[0.2em] text-black uppercase transition hover:bg-neutral-200"
          >
            {staffLabel}
          </Link>
        </div>
      </nav>

      <div className="flex items-center justify-between rounded-full border border-white/25 bg-black/40 px-3 py-2 backdrop-blur-xl md:hidden">
        <Link
          href="/"
          className="px-2 text-base font-bold tracking-tight lowercase"
        >
          {CAFE.name}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={staffHref}
            className="rounded-full bg-white px-4 py-2 text-[10px] font-semibold tracking-[0.18em] text-black uppercase"
          >
            {staffLabel}
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30"
          >
            <span className="sr-only">Menu</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-white" fill="none">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" strokeWidth="1.6" />
              ) : (
                <path d="M5 8h14M5 12h14M5 16h14" strokeWidth="1.6" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black px-6 pt-28 pb-10 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/30"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-white" fill="none">
              <path d="M6 6l12 12M18 6L6 18" strokeWidth="1.6" />
            </svg>
          </button>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="border-b border-white/10 py-5 text-lg tracking-[0.22em] uppercase"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={staffHref}
            onClick={() => setOpen(false)}
            className="mt-8 rounded-full bg-white py-3 text-center text-sm font-semibold tracking-[0.2em] text-black uppercase"
          >
            {staffLabel}
          </Link>
        </div>
      ) : null}
    </header>
  );
}
