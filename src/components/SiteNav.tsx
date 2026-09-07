import Link from "next/link";
import { CAFE } from "@/lib/cafe";
import type { Session } from "@/lib/types";

type SiteNavProps = {
  session: Session | null;
};

const ghost =
  "rounded-full px-4 py-2 text-[11px] font-medium tracking-[0.2em] text-white/90 uppercase transition hover:bg-white/15 sm:px-5";

export function SiteNav({ session }: SiteNavProps) {
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

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-4 pt-5 sm:pt-7">
      <nav className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/25 bg-black/35 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <Link
          href="/"
          className="shrink-0 px-4 py-2 text-sm font-bold tracking-tight lowercase text-white sm:px-5"
        >
          {CAFE.name}
        </Link>
        <span className="hidden h-4 w-px bg-white/25 sm:block" />
        <Link href="/#about" className={ghost}>
          About Us
        </Link>
        <Link href="/#menu" className={ghost}>
          Menu
        </Link>
        <Link href="/#contact" className={ghost}>
          Contact Us
        </Link>
        <a
          href={CAFE.facebookHref}
          target="_blank"
          rel="noreferrer"
          className={ghost}
        >
          Facebook
        </a>
        <Link
          href={staffHref}
          className="shrink-0 rounded-full bg-white px-4 py-2 text-[11px] font-semibold tracking-[0.2em] text-black uppercase transition hover:bg-neutral-200 sm:px-5"
        >
          {staffLabel}
        </Link>
      </nav>
    </header>
  );
}
