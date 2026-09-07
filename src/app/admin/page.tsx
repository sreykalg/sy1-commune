import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/AdminDashboard";
import { StaffHeader } from "@/components/StaffHeader";
import { getSession } from "@/lib/auth";

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/login");
  }

  return (
    <main className="min-h-svh bg-black">
      <StaffHeader
        session={session}
        title="Admin"
        subtitle="Sales analysis"
      />
      <AdminDashboard />
    </main>
  );
}
