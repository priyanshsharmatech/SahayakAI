import AdminClient from "@/components/AdminClient";
import { getSessionUser, requireAdminSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function page() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  // Platform-admin access = env-var superadmin OR a DB staff role
  // (superadmin/support/analyst). requireAdminSession() resolves both and
  // also excludes impersonating sessions. Non-admins go to their dashboard.
  const admin = await requireAdminSession();
  if (!admin) {
    redirect("/dashboard");
  }

  return <AdminClient email={user.email} />;
}

export default page;
