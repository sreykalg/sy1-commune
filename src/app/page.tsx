import { getSession } from "@/lib/auth";
import { LandingPage } from "@/components/LandingPage";

export default async function Home() {
  const session = await getSession();
  return <LandingPage session={session} />;
}
