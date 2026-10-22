import { Building2, CircleOff, UsersRound } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { StatCard } from "@/components/kit/stat-card";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { formatDate, initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "cn";
import {
  CreateOrganizationDialog,
  EditOrganizationDialog,
  OrganizationActiveSwitch,
} from "./organization-dialogs";
import { Roadmap } from "./roadmap";

export const metadata = { title: "Plataforma" };

export default function PlataformaPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Plataforma"
        description="Gráficas clientes da GraphicX. Você vê cadastros e números gerais, não os pedidos delas."
        actions={<CreateOrganizationDialog />}
      />
      <Suspense
        fallback={
          <div className="flex flex-col gap-4" aria-hidden>
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-2xl bg-muted" />
          </div>
        }
      >
        <Organizations />
      </Suspense>
    </div>
  );
}

function formatCnpj(digits: string) {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

async function Organizations() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: orgs }, { count: people }] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, slug, name, legal_name, document, active, created_at, organization_members(count)",
      )
      .order("active", { ascending: false })
      .order("name"),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const list = (orgs ?? []).map((org) => ({
    ...org,
    members: org.organization_members[0]?.count ?? 0,
  }));
  const activeCount = list.filter((org) => org.active).length;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Building2} value={activeCount} label="Gráficas ativas" />
        <StatCard icon={UsersRound} tone="teal" value={people ?? 0} label="Pessoas na plataforma" />
        <StatCard
          icon={CircleOff}
          tone="warning"
          value={list.length - activeCount}
          label="Gráficas desativadas"
        />
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhuma gráfica cadastrada ainda.
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((org) => (
            <li
              key={org.id}
              className={cn(
                "flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm",
                !org.active && "opacity-70",
              )}
            >
              <span
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent font-semibold text-accent-foreground"
              >
                {initials(org.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{org.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{org.slug}</span>
                  {org.document && ` · ${formatCnpj(org.document)}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {org.members} {org.members === 1 ? "pessoa" : "pessoas"} · desde{" "}
                  {formatDate(org.created_at)}
                </p>
              </div>
              <EditOrganizationDialog organization={org} />
              <div className="flex flex-col items-end gap-1">
                <OrganizationActiveSwitch id={org.id} name={org.name} active={org.active} />
                <span className="text-[0.7rem] text-muted-foreground">
                  {org.active ? "Ativa" : "Desativada"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Roadmap />
    </>
  );
}
