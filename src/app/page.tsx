import { getSession } from "@/lib/auth";
import { LandingPage } from "@/components/LandingPage";
import { getStore } from "@/lib/store";

export default async function Home() {
  const session = await getSession();
  const store = await getStore();
  return <LandingPage session={session} menu={store.menu} />;
}
