import Image from "next/image";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { CAFE } from "@/lib/cafe";
import { MENU, formatMoney } from "@/lib/menu";
import type { Session } from "@/lib/types";

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="text-[11px] tracking-[0.42em] text-neutral-500 uppercase">
      {children}
    </p>
  );
}

function Photo({
  src,
  alt,
  className,
  sizes,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <article className={`group relative overflow-hidden bg-neutral-900 ${className ?? ""}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className="object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
      />
    </article>
  );
}

export function LandingPage({ session }: { session: Session | null }) {
  return (
    <div className="bg-black text-white">
      <section className="relative min-h-svh overflow-hidden">
        <Image
          src="/images/hero-bar.jpg"
          alt="commune cafe interior"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_42%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/5 to-black/50" />
        <SiteNav session={session} />
        <div className="relative z-10 flex min-h-svh flex-col items-center justify-end px-6 pb-16 text-center sm:pb-20">
          <p className="text-[11px] tracking-[0.45em] text-white/80 uppercase">
            commune café
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-extrabold leading-[0.95] tracking-[0.08em] text-white uppercase drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)] sm:text-6xl md:text-7xl">
            We commune,
            <br />
            over coffee
          </h1>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0b0b0b] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl items-stretch gap-4 md:grid-cols-12">
          <article className="relative min-h-[420px] overflow-hidden bg-black md:col-span-7 md:min-h-[640px]">
            <Image
              src="/images/open.jpg"
              alt={`${CAFE.name} open ${CAFE.hours}`}
              fill
              sizes="(max-width: 768px) 100vw, 58vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8 sm:p-10">
              <p className="font-serif text-6xl italic tracking-tight sm:text-8xl">
                OPEN!
              </p>
              <p className="mt-3 text-sm tracking-[0.28em] text-white/80 uppercase">
                {CAFE.hours} · {CAFE.hoursNote}
              </p>
            </div>
          </article>
          <Photo
            src="/images/drinks.jpg"
            alt="Signature iced drinks at commune"
            className="min-h-[360px] md:col-span-5 md:min-h-[640px]"
            sizes="(max-width: 768px) 100vw, 42vw"
          />
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto mb-12 max-w-6xl text-center">
          <p className="font-script text-4xl sm:text-5xl">have a seat, take a sip</p>
          <Eyebrow>{CAFE.tagline}</Eyebrow>
        </div>
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2">
          <Photo
            src="/images/cups.jpg"
            alt="Iced latte and matcha at commune"
            className="min-h-[440px] md:min-h-[520px]"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <Photo
            src="/images/signatures.jpg"
            alt="Sea salt cream, Spanish latte, and brownie"
            className="min-h-[440px] md:min-h-[520px]"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <Photo
            src="/images/matcha-umami.jpg"
            alt="New in the menu: Matcha Umami"
            className="min-h-[520px]"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <Photo
            src="/images/carrier.jpg"
            alt="Have a seat, take a sip"
            className="min-h-[520px]"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
        <div className="mx-auto mt-4 max-w-6xl">
          <Photo
            src="/images/spread.jpg"
            alt="Come sip eat — drinks, panini, and fries"
            className="min-h-[420px] sm:min-h-[580px]"
            sizes="100vw"
          />
        </div>
      </section>

      <section
        id="menu"
        className="border-y border-white/10 bg-[#111] px-4 py-20 sm:px-6 sm:py-28"
      >
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>The board</Eyebrow>
            <h2 className="mt-4 font-serif text-4xl italic sm:text-5xl">
              sip · eat
            </h2>
            <p className="mt-4 max-w-md text-neutral-400">
              Signatures from the bar — iced, crumbled, and pulled to share.
            </p>
            <ul className="mt-10 divide-y divide-white/10">
              {MENU.map((item) => (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-6 py-4"
                >
                  <div>
                    <p className="font-medium tracking-wide">{item.name}</p>
                    <p className="mt-1 text-[11px] tracking-[0.22em] text-neutral-500 uppercase">
                      {item.category}
                    </p>
                  </div>
                  <p className="shrink-0 text-neutral-300">
                    {formatMoney(item.price)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <Photo
            src="/images/menu-carrier.jpg"
            alt="Biscoff latte, caramel macchiato, Spanish latte, sea salt cream"
            className="min-h-[520px] lg:min-h-[680px]"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        </div>
      </section>

      <section id="about" className="px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <Photo
            src="/images/storefront.jpg"
            alt="commune cafe storefront at night"
            className="min-h-[480px] lg:min-h-[620px]"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
          <div className="max-w-lg lg:pl-6">
            <Eyebrow>About Us</Eyebrow>
            <Image
              src="/images/logo.jpg"
              alt={CAFE.name}
              width={200}
              height={200}
              className="mt-8 h-20 w-20 object-cover"
            />
            <h2 className="mt-6 text-4xl font-bold tracking-tight">{CAFE.name}</h2>
            <p className="mt-3 text-[11px] tracking-[0.32em] text-neutral-500 uppercase">
              {CAFE.tagline}
            </p>
            <p className="mt-8 text-lg leading-8 text-neutral-300">
              Every cup tells a story, and every sip brings us closer together. A
              quiet industrial house in Tetuan — matcha umami, sea salt cream,
              panini, and a table meant to be shared.
            </p>
          </div>
        </div>
      </section>

      <section
        id="contact"
        className="border-t border-white/10 bg-[#0b0b0b] px-4 py-20 sm:px-6 sm:py-28"
      >
        <div className="mx-auto mb-12 max-w-6xl text-center">
          <Eyebrow>Contact Us</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Where to find us?
          </h2>
        </div>
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-12">
          <div className="flex flex-col justify-between border border-white/10 bg-black/40 px-8 py-10 lg:col-span-5">
            <div>
              <p className="text-[11px] tracking-[0.28em] text-neutral-500 uppercase">
                Visit
              </p>
              <a
                href={CAFE.mapsHref}
                target="_blank"
                rel="noreferrer"
                className="mt-6 block text-xl leading-relaxed text-white transition hover:text-neutral-300"
              >
                {CAFE.street}
                <span className="mt-2 block text-base text-neutral-400">
                  ({CAFE.landmark})
                </span>
                <span className="mt-2 block text-base text-neutral-300">
                  {CAFE.city}
                </span>
              </a>
            </div>
            <div className="mt-12 space-y-3 text-sm text-neutral-300">
              <p className="tracking-[0.18em] uppercase">
                {CAFE.hours} · {CAFE.hoursNote}
              </p>
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
                  Facebook · {CAFE.facebookLabel}
                </a>
              </p>
            </div>
          </div>
          <Photo
            src="/images/open-now.jpg"
            alt="We're open now at commune"
            className="min-h-[360px] lg:col-span-4 lg:min-h-[560px]"
            sizes="(max-width: 1024px) 100vw, 33vw"
          />
          <Photo
            src="/images/collage.jpg"
            alt="commune cafe moments"
            className="min-h-[360px] lg:col-span-3 lg:min-h-[560px]"
            sizes="(max-width: 1024px) 100vw, 25vw"
          />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
