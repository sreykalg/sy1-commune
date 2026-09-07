"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CAFE } from "@/lib/cafe";
import { SocialLinks } from "@/components/SocialLinks";
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

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

      <div className="relative md:hidden">
        <div className="relative z-50 flex items-center justify-between rounded-full border border-white/25 bg-black/50 px-3 py-1.5 backdrop-blur-xl">
          <Link
            href="/"
            className="px-2 text-[15px] font-bold tracking-tight lowercase"
          >
            {CAFE.name}
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30"
          >
            <span className="sr-only">Menu</span>
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 stroke-white"
              fill="none"
            >
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" strokeWidth="1.6" />
              ) : (
                <path d="M5 8h14M5 12h14M5 16h14" strokeWidth="1.6" />
              )}
            </svg>
          </button>
        </div>

        {open ? (
          <>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/45"
            />
            <div className="relative z-50 mt-2 overflow-hidden rounded-2xl border border-white/20 bg-black/80 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
              <nav className="px-3 py-2">
                {links.map((link, index) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/10"
                  >
                    <span className="w-5 text-[10px] tracking-[0.18em] text-neutral-500">
                      0{index + 1}
                    </span>
                    <span className="text-[13px] tracking-[0.16em] text-white uppercase">
                      {link.label}
                    </span>
                  </Link>
                ))}
                <Link
                  href={staffHref}
                  onClick={() => setOpen(false)}
                  className="mt-1 mb-1 block rounded-full bg-white px-4 py-2.5 text-center text-[11px] font-semibold tracking-[0.2em] text-black uppercase"
                >
                  {staffLabel}
                </Link>
              </nav>
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                <p className="text-[10px] tracking-[0.28em] text-neutral-500 uppercase">
                  Follow
                </p>
                <SocialLinks />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
