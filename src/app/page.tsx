import { LandingPage } from "@/components/LandingPage";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const store = await getStore();
  return <LandingPage menu={store.menu} />;
}

