import { AuthCard } from "@/components/kit/auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Esqueci minha senha" };

export default function EsqueciSenhaPage() {
  return (
    <AuthCard
      title="Esqueci minha senha"
      description="Enviamos um link para você criar uma nova senha."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
