import { Lock } from "lucide-react";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDocument, formatPhone } from "@/lib/documents";
import { formatAddress } from "@/lib/address";
import { createClient } from "@/lib/supabase/server";
import { OrganizationDataDialog } from "./organization-form";

export const metadata = { title: "Dados da gráfica" };

export default function EmpresaPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/configuracoes" label="Configurações" />
      <Suspense fallback={<ListSkeleton />}>
        <Empresa />
      </Suspense>
    </div>
  );
}

async function Empresa() {
  const { membership } = await requireOrg("configuracoes.ver");
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, slug, legal_name, document, phone, cep, street, number, complement, district, city, state",
    )
    .eq("id", membership.organizationId)
    .single();
  if (!org) return null;
  const canManage = can(membership.permissions, "configuracoes.gerenciar");

  return (
    <>
      <PageHeader
        title="Dados da gráfica"
        description="Nome, razão social e CNPJ que aparecem no sistema e nos links dos clientes, e o endereço usado como remetente nas etiquetas de envio."
        actions={canManage ? <OrganizationDataDialog organization={org} /> : undefined}
      />
      <dl className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2">
        <Item label="Nome da gráfica" value={org.name} />
        <Item label="Razão social" value={org.legal_name ?? "—"} />
        <Item label="CNPJ" value={org.document ? formatDocument(org.document) : "—"} />
        <Item label="Telefone" value={org.phone ? formatPhone(org.phone) : "—"} />
        <Item
          label="Endereço (remetente das etiquetas)"
          value={formatAddress(org) || "Não informado"}
        />
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Código na plataforma</dt>
          <dd className="flex items-center gap-2 font-mono">
            {org.slug}
            <Lock className="size-3.5 text-muted-foreground" aria-hidden />
          </dd>
          <p className="text-xs text-muted-foreground">Só o suporte da GraphicX altera o código.</p>
        </div>
      </dl>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
