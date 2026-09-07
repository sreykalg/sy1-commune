import { redirect } from "next/navigation";
import { PosClient } from "@/components/PosClient";
import { StaffHeader } from "@/components/StaffHeader";
import { getSession } from "@/lib/auth";
import { getStore } from "@/lib/store";

export default async function PosPage() {
  const session = await getSession();
  if (!session || session.role !== "barista") {
    redirect("/login");
  }

  const store = await getStore();
  const recentOrders = [...store.orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  return (
    <main className="min-h-svh bg-black">
      <StaffHeader
        session={session}
        title="POS"
        subtitle="Sale In Charge"
      />
      <PosClient pos={store.pos} recentOrders={recentOrders} />
    </main>
  );
}
