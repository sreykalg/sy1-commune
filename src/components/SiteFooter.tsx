import Image from "next/image";
import Link from "next/link";
import { CAFE } from "@/lib/cafe";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black px-6 py-16">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-4">
        <div className="md:col-span-1">
          <Link href="/" className="inline-block">
            <Image
              src="/images/logo.jpg"
              alt={CAFE.name}
              width={160}
              height={160}
              className="h-16 w-16 object-cover"
            />
          </Link>
          <p className="mt-5 text-xl font-bold tracking-tight">{CAFE.name}</p>
          <p className="mt-2 text-[10px] tracking-[0.28em] text-neutral-500 uppercase">
            {CAFE.tagline}
          </p>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.28em] text-neutral-500 uppercase">
            Visit
          </p>
          <a
            href={CAFE.mapsHref}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block text-sm leading-6 text-neutral-300 hover:text-white"
          >
            {CAFE.street}
            <br />
            {CAFE.city}
          </a>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.28em] text-neutral-500 uppercase">
            Hours
          </p>
          <p className="mt-4 text-sm leading-6 text-neutral-300">
            {CAFE.hours}
            <br />
            {CAFE.hoursNote}
          </p>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.28em] text-neutral-500 uppercase">
            Connect
          </p>
          <div className="mt-4 space-y-2 text-sm text-neutral-300">
            <p>
              <a href={CAFE.phoneHref} className="hover:text-white">
                {CAFE.phone}
              </a>
            </p>
            <p>
              <a href={CAFE.emailHref} className="hover:text-white">
                {CAFE.email}
              </a>
            </p>
            <p>
              <a
                href={CAFE.facebookHref}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                Facebook
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-14 flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-[11px] tracking-[0.18em] text-neutral-600 uppercase">
        <p>© {new Date().getFullYear()} commune. Tetuan, Zamboanga City</p>
        <p>have a seat, take a sip</p>
      </div>
    </footer>
  );
}
