"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { href: "/financeiro", label: "Visão geral" },
  { href: "/financeiro/receber", label: "A receber" },
  { href: "/financeiro/pagar", label: "A pagar" },
  { href: "/financeiro/caixa", label: "Fluxo de caixa" },
  { href: "/financeiro/dre", label: "DRE" },
  { href: "/financeiro/margem", label: "Margem por produto" },
];

/** Abas do financeiro (rolam na horizontal no celular). */
export function FinanceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções do financeiro" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex w-max gap-1 rounded-xl bg-muted p-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                  active && "bg-card text-foreground shadow-sm",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
