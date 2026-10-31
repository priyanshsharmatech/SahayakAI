import AuthForm from "@/components/AuthForm";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) {
    redirect("/dashboard");
  }
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
