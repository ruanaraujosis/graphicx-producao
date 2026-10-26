import { Suspense } from "react";
import { requireOrg } from "@/lib/auth/dal";
import { findNavItem } from "@/lib/navigation";
import { ComingSoon } from "./coming-soon";
import { PageHeader } from "./page-header";

/** Página provisória de um módulo do menu que ainda não foi construído. */
export function ModulePlaceholder({ href, description }: { href: string; description: string }) {
  const item = findNavItem(href);
  if (!item) throw new Error(`Item de menu não encontrado: ${href}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={item.label} description={description} />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <Guarded href={href} />
      </Suspense>
    </div>
  );
}

async function Guarded({ href }: { href: string }) {
  const item = findNavItem(href)!;
  await requireOrg(item.permission);
  return <ComingSoon title={item.label} />;
}
