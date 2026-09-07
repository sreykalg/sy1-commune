import { redirect } from "next/navigation";
import { PosClient } from "@/components/PosClient";
import { getSession } from "@/lib/auth";
import { getStore } from "@/lib/store";

export default async function PosPage() {
  const session = await getSession();
  if (!session || session.role !== "barista") {
    redirect("/login");
  }

  const store = await getStore();

  return (
    <main className="h-svh overflow-hidden bg-neutral-100 text-black">
      <PosClient
        session={session}
        pos={store.pos}
        menu={store.menu}
        categories={store.categories}
        promotions={store.promotions}
        orders={store.orders}
      />
    </main>
  );
}
