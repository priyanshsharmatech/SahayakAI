import AuthForm from "@/components/AuthForm";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <AuthForm mode="forgot" />
    </Suspense>
  );
}
