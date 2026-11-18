import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, AuthCardSkeleton } from "@/components/kit/auth-card";
import { getSession } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import { MfaEnroll, MfaVerify } from "./mfa-forms";

export const metadata = { title: "Verificação em duas etapas" };

export default function MfaPage({ searchParams }: PageProps<"/mfa">) {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <Mfa searchParams={searchParams} />
    </Suspense>
  );
}

async function Mfa({ searchParams }: { searchParams: PageProps<"/mfa">["searchParams"] }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const rawNext = (await searchParams).next;
  const next = safeNextPath(typeof rawNext === "string" ? rawNext : undefined);
  if (session.aal === "aal2") redirect(next);

  const supabase = await createClient();
  // Quem já tem autenticador confirma o código mesmo sem o cargo exigir MFA
  // (ex.: o Supabase pede aal2 para trocar a senha pelo link do e-mail).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!session.mfaRequired && aal?.nextLevel !== "aal2") redirect(next);
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp[0];

  if (factor) {
    return (
      <AuthCard
        title="Verificação em duas etapas"
        description="Abra o app autenticador no celular e digite o código de 6 dígitos da GraphicX."
      >
        <MfaVerify factorId={factor.id} next={next} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Proteja sua conta de administrador"
      description="Administradores entram com senha + código do celular. Configure uma vez, leva 1 minuto."
    >
      <MfaEnroll next={next} />
    </AuthCard>
  );
}
