"use client";

export default function PosError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex h-svh flex-col items-center justify-center bg-neutral-100 px-6 text-center text-black">
      <p className="text-lg font-medium">POS could not load</p>
      <p className="mt-2 max-w-sm text-sm text-neutral-500">
        A server error stopped this page. Try again without leaving the register.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 rounded-full bg-black px-5 py-2 text-sm font-medium text-white"
      >
        Reload POS
      </button>
    </main>
  );
}
