import AuthForm from "@/components/AuthForm";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <AuthForm mode="reset" />
    </Suspense>
  );
}
