import EmbedClient from "@/components/EmbedClient";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import React from "react";

export const dynamic = "force-dynamic";

async function page() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return (
    <div>
      <EmbedClient ownerId={user.id} />
    </div>
  );
}

export default page;
