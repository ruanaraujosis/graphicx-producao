import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, AuthCardSkeleton } from "@/components/kit/auth-card";
import { getSession } from "@/lib/auth/dal";
import { NewPasswordForm } from "./new-password-form";

export const metadata = { title: "Nova senha" };

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  // O link do e-mail cria uma sessão; sem ela, o link expirou ou já foi usado.
  const session = await getSession();
  if (!session) redirect("/login?erro=link-invalido");

  return (
    <AuthCard
      title="Crie uma nova senha"
      description={`Conta: ${session.email ?? session.username}`}
    >
      <NewPasswordForm />
    </AuthCard>
  );
}
