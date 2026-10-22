import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, AuthCardSkeleton } from "@/components/kit/auth-card";
import { requireUser } from "@/lib/auth/dal";
import { OrganizationPicker } from "./organization-picker";

export const metadata = { title: "Escolha a gráfica" };

export default function SelecionarEmpresaPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <Picker />
    </Suspense>
  );
}

async function Picker() {
  const session = await requireUser();
  if (session.memberships.length === 0) {
    redirect(session.isPlatformAdmin ? "/plataforma" : "/sem-acesso");
  }

  return (
    <AuthCard
      title={`Olá, ${session.fullName.split(" ")[0]}!`}
      description="Escolha qual gráfica você quer acessar agora."
    >
      <OrganizationPicker
        organizations={session.memberships.map((m) => ({
          id: m.organizationId,
          name: m.name,
          roleLabel: m.roleName,
        }))}
        showPlatform={session.isPlatformAdmin}
      />
    </AuthCard>
  );
}
