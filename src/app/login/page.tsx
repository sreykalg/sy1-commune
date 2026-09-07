import { BrandLogo } from "@/components/BrandLogo";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-12 sm:px-6 sm:py-16">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/hero-wide.jpg)" }}
      />
      <div className="absolute inset-0 bg-black/75" />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <BrandLogo size="md" showTagline />
        <p className="mt-6 mb-10 text-xs tracking-[0.3em] text-neutral-300 uppercase">
          Staff login
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
