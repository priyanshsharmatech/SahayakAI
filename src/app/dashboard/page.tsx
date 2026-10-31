import DashboardClient from "@/components/DashboardClient";
import { getSessionUser } from "@/lib/session";
import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { redirect } from "next/navigation";
import React from "react";

export const dynamic = "force-dynamic";

async function page() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  // Has this user already seen the first-run tour? (Per-account so it never
  // replays on later logins / other browsers.)
  await connectDb();
  const dbUser = await User.findById(user.id).select("tourSeen").lean<{ tourSeen?: boolean }>();

  return (
    <DashboardClient
      ownerId={user.id}
      email={user.email}
      isAdmin={user.role === "superadmin"}
      impersonatedBy={user.impersonatedBy ?? null}
      tourSeen={Boolean(dbUser?.tourSeen)}
    />
  );
}

export default page;
