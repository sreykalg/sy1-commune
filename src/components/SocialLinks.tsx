import { CAFE } from "@/lib/cafe";

const iconClass = "h-4 w-4 fill-current";

type SocialId = "facebook" | "instagram" | "tiktok";

function SocialIcon({ id }: { id: SocialId }) {
  if (id === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClass}>
        <path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.6c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.2h2.8V22h3.4Z" />
      </svg>
    );
  }

  if (id === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClass}>
        <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 4.8A4.2 4.2 0 1 0 16.2 12 4.2 4.2 0 0 0 12 7.8Zm6.1-.9a1 1 0 1 0 1 1 1 1 0 0 0-1-1Z" />
      </svg>
    );
  }

  if (id === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClass}>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68a6.34 6.34 0 0 0 10.86 4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.14z" />
      </svg>
    );
  }

  return null;
}

export function SocialLinks({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`.trim()}>
      {CAFE.socials.map((social) => (
        <a
          key={social.id}
          href={social.href}
          target="_blank"
          rel="noreferrer"
          aria-label={social.label}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition hover:border-white hover:text-white"
        >
          <SocialIcon id={social.id} />
        </a>
      ))}
    </div>
  );
}
