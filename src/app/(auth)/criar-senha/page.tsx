import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, AuthCardSkeleton } from "@/components/kit/auth-card";
import { getSession } from "@/lib/auth/dal";
import { NewPasswordForm } from "../redefinir-senha/new-password-form";

export const metadata = { title: "Crie sua senha" };

export default function CriarSenhaPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mfaRequired && session.aal !== "aal2") redirect("/mfa?next=/criar-senha");
  if (!session.mustChangePassword) redirect("/inicio");

  return (
    <AuthCard
      title={`Bem-vindo(a), ${session.fullName.split(" ")[0]}!`}
      description="Sua senha atual é provisória. Crie uma senha só sua para continuar — ninguém mais vai saber qual é."
    >
      <NewPasswordForm from="/criar-senha" />
    </AuthCard>
  );
}
