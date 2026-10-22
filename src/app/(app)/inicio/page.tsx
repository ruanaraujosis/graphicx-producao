import Link from "next/link";
import { Suspense } from "react";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { PageHeader } from "@/components/kit/page-header";
import { IconChip, type Tone } from "@/components/kit/stat-card";
import { requireOrg } from "@/lib/auth/dal";
import { TIME_ZONE } from "@/lib/format";
import { navItemsFor } from "@/lib/navigation";

export const metadata = { title: "Início" };

const SHORTCUT_TONES: Tone[] = ["primary", "teal", "info", "success", "warning"];

export default function InicioPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<div className="h-14 w-72 animate-pulse rounded-xl bg-muted" />}>
        <Greeting />
      </Suspense>

      <section aria-labelledby="atalhos" className="flex flex-col gap-3">
        <h2 id="atalhos" className="font-heading text-base font-semibold">
          Seus módulos
        </h2>
        <Suspense
          fallback={
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          }
        >
          <Shortcuts />
        </Suspense>
      </section>

      <section aria-labelledby="canais" className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 id="canais" className="font-heading text-base font-semibold">
          Canais de venda
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Todos os pedidos vão chegar numa lista só, identificados por canal.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ChannelBadge channel="shopee" />
          <ChannelBadge channel="whatsapp" />
          <ChannelBadge channel="balcao" />
        </div>
      </section>
    </div>
  );
}

function greetingFor(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: TIME_ZONE,
    }).format(date),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

async function Greeting() {
  const { session, membership } = await requireOrg();
  const firstName = session.fullName.split(" ")[0];
  return (
    <PageHeader
      title={`${greetingFor(new Date())}, ${firstName}!`}
      description={`${membership.name} · você está como ${membership.roleName}.`}
    />
  );
}

async function Shortcuts() {
  const { session, membership } = await requireOrg();
  const items = navItemsFor({
    permissions: membership.permissions,
    isPlatformAdmin: session.isPlatformAdmin,
  }).filter((item) => item.href !== "/inicio");
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item, index) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <IconChip icon={item.icon} tone={SHORTCUT_TONES[index % SHORTCUT_TONES.length]} />
          <div>
            <p className="font-medium">{item.label}</p>
            <p className="text-xs text-muted-foreground">
              {item.comingSoon ? "Em breve" : "Disponível"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
