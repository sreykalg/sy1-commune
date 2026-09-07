import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/AdminDashboard";
import { AdminShell } from "@/components/AdminShell";
import { StaffHeader } from "@/components/StaffHeader";
import { getSession } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { publicUser } from "@/lib/users";

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/login");
  }

  const store = await getStore();

  return (
    <main className="min-h-svh bg-neutral-100 text-black">
      <StaffHeader
        session={session}
        title="Admin"
        subtitle="Sales and staff"
      />
      <AdminShell session={session} users={store.users.map(publicUser)}>
        <AdminDashboard />
      </AdminShell>
    </main>
  );
}
