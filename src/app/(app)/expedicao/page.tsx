import Link from "next/link";
import { Suspense } from "react";
import { cn } from "cn";
import { ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { todayIso } from "@/lib/orders/deadline";
import { createClient } from "@/lib/supabase/server";
import { ShippingList, type ShippingRow } from "./shipping-list";

export const metadata = { title: "Expedição" };

const TABS = [
  { value: "", label: "Para enviar" },
  { value: "enviados", label: "Enviados" },
] as const;

/** Etapas em que o pedido já pode ser preparado para o envio. */
const SHIPPABLE = ["aprovado", "em_impressao", "acabamento", "expedicao"] as const;

export default function ExpedicaoPage({ searchParams }: PageProps<"/expedicao">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expedição"
        description="Organize o envio da Shopee, imprima as etiquetas em lote e identifique os pacotes com QR Code."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Expedicao searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Expedicao({
  searchParams,
}: {
  searchParams: PageProps<"/expedicao">["searchParams"];
}) {
  const { membership } = await requireOrg("expedicao.ver");
  const raw = await searchParams;
  const tab = raw.aba === "enviados" ? "enviados" : "";
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      "id, number, customer_name, channel, status, due_date, ship_by_at, external_status, shipment_arranged_at, tracking_code",
    )
    .eq("organization_id", membership.organizationId)
    .limit(300);
  query =
    tab === "enviados"
      ? query.eq("status", "enviado").order("shipped_at", { ascending: false })
      : query
          .in("status", [...SHIPPABLE])
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("number");
  const { data } = await query;

  return (
    <>
      <nav aria-label="Listas" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value ? `/expedicao?aba=${t.value}` : "/expedicao"}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm md:min-h-9",
              tab === t.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <ShippingList
        rows={(data ?? []) as ShippingRow[]}
        today={todayIso()}
        canManage={can(membership.permissions, "expedicao.gerenciar")}
      />
    </>
  );
}
