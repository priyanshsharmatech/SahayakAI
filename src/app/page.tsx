import HomeClient from "@/components/HomeClient";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <HomeClient
      email={user?.email ?? ""}
      isAdmin={user?.role === "superadmin"}
    />
  );
}
