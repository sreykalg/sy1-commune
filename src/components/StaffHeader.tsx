import { BrandLogo } from "@/components/BrandLogo";
import { logout } from "@/actions/auth";
import type { Session } from "@/lib/types";

type StaffHeaderProps = {
  session: Session;
  title: string;
  subtitle: string;
};

export function StaffHeader({ session, title, subtitle }: StaffHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6 sm:py-5">
      <div>
        <BrandLogo size="sm" align="start" />
        <p className="mt-1 text-xs tracking-[0.25em] text-neutral-500 uppercase">
          {title}
        </p>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="text-right">
          <p className="font-medium">{session.name}</p>
          <p className="text-neutral-500">{subtitle}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm transition hover:border-black hover:bg-black hover:text-white"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
