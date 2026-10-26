"use client";

import { ArrowDown, Pencil, Trophy } from "lucide-react";
import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EntityFormDialog } from "@/components/kit/entity-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { MemberStats } from "@/lib/orders/ranking";
import { setCommission } from "./actions";
import { commissionSchema } from "./schema";

export type RankingPeriod = { key: string; label: string; rows: MemberStats[] };

type SortKey = "sales" | "orders" | "avgTicket" | "commission" | "produced";

/** Cor da posição: 1º ouro, 2º e 3º em destaque, o resto neutro. */
const PODIUM = [
  "bg-warning-soft text-warning",
  "bg-info-soft text-info",
  "bg-secondary text-secondary-foreground",
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

const percent = (rate: number) => `${rate.toLocaleString("pt-BR")}%`;

function Position({ index }: { index: number }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
        PODIUM[index] ?? "bg-muted text-muted-foreground",
      )}
      aria-label={`${index + 1}º lugar`}
    >
      {index === 0 ? <Trophy className="size-4" aria-hidden /> : index + 1}
    </span>
  );
}

function Person({ row }: { row: MemberStats }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar>
        <AvatarFallback className="text-xs font-semibold">{initials(row.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{row.name}</p>
        {row.role && <p className="truncate text-xs text-muted-foreground">{row.role}</p>}
      </div>
    </div>
  );
}

export function TeamRankingTable({
  periods,
  showSales,
  showMoney,
  showProduction,
  canEditCommission,
}: {
  periods: RankingPeriod[];
  showSales: boolean;
  showMoney: boolean;
  showProduction: boolean;
  canEditCommission: boolean;
}) {
  const router = useRouter();
  const [periodKey, setPeriodKey] = useState(periods[1]?.key ?? periods[0]?.key);
  const [sortKey, setSortKey] = useState<SortKey>(
    showMoney ? "sales" : showSales ? "orders" : "produced",
  );
  const [editing, setEditing] = useState<MemberStats | null>(null);

  const period = periods.find((p) => p.key === periodKey) ?? periods[0];
  const rows = [...(period?.rows ?? [])].sort(
    (a, b) => b[sortKey] - a[sortKey] || a.name.localeCompare(b.name),
  );

  const columns: { key: SortKey; label: string; show: boolean }[] = [
    { key: "sales", label: "Vendas", show: showMoney },
    { key: "orders", label: "Pedidos", show: showSales },
    { key: "avgTicket", label: "Ticket médio", show: showMoney },
    { key: "commission", label: "Comissão", show: showMoney },
    { key: "produced", label: "Produzidos", show: showProduction },
  ];
  const visible = columns.filter((c) => c.show);

  const commissionCell = (row: MemberStats) => (
    <div className="flex items-center justify-end gap-1">
      <div className="text-right">
        <p className="tabular-nums">{formatCurrency(row.commission)}</p>
        <p className="text-xs text-muted-foreground">
          {row.commissionRate === null ? "Sem comissão" : percent(row.commissionRate)}
        </p>
      </div>
      {canEditCommission && (
        <Button
          variant="ghost"
          size="icon"
          className="size-11 md:size-8"
          aria-label={`Definir comissão de ${row.name}`}
          onClick={() => setEditing(row)}
        >
          <Pencil />
        </Button>
      )}
    </div>
  );

  const valueOf = (key: SortKey, row: MemberStats): React.ReactNode => {
    switch (key) {
      case "sales":
        return formatCurrency(row.sales);
      case "orders":
        return row.orders;
      case "avgTicket":
        return row.orders ? formatCurrency(row.avgTicket) : "—";
      case "commission":
        return commissionCell(row);
      case "produced":
        return row.produced;
    }
  };

  return (
    <section
      aria-labelledby="ranking"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ranking" className="font-heading text-base font-semibold">
          Ranking da equipe
        </h2>
        <Tabs value={periodKey} onValueChange={setPeriodKey}>
          <TabsList variant="line">
            {periods.map((p) => (
              <TabsTrigger key={p.key} value={p.key} className="min-h-11 md:min-h-8">
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma pessoa ativa na equipe.</p>
      ) : (
        <>
          {/* Computador: tabela com colunas ordenáveis. */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 text-xs tracking-wide uppercase">#</TableHead>
                  <TableHead className="text-xs tracking-wide uppercase">Pessoa</TableHead>
                  {visible.map((c) => (
                    <TableHead key={c.key} className="text-right">
                      <button
                        type="button"
                        onClick={() => setSortKey(c.key)}
                        aria-sort={sortKey === c.key ? "descending" : undefined}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs tracking-wide uppercase hover:text-foreground",
                          sortKey === c.key && "text-foreground",
                        )}
                      >
                        {c.label}
                        <ArrowDown
                          className={cn("size-3", sortKey !== c.key && "opacity-30")}
                          aria-hidden
                        />
                      </button>
                    </TableHead>
                  ))}
                  {showSales && (
                    <TableHead className="text-right text-xs tracking-wide uppercase">
                      Última venda
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <Position index={index} />
                    </TableCell>
                    <TableCell>
                      <Person row={row} />
                    </TableCell>
                    {visible.map((c) => (
                      <TableCell key={c.key} className="text-right tabular-nums">
                        {valueOf(c.key, row)}
                      </TableCell>
                    ))}
                    {showSales && (
                      <TableCell className="text-right text-muted-foreground">
                        {row.lastSaleAt ? formatDateTime(row.lastSaleAt) : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Celular e tablet: cards. */}
          <ol className="flex flex-col gap-3 lg:hidden">
            {rows.map((row, index) => (
              <li key={row.userId} className="flex flex-col gap-3 rounded-xl border p-3">
                <div className="flex items-center gap-3">
                  <Position index={index} />
                  <Person row={row} />
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {visible
                    .filter((c) => c.key !== "commission")
                    .map((c) => (
                      <div key={c.key}>
                        <dt className="text-xs text-muted-foreground">{c.label}</dt>
                        <dd className="font-medium tabular-nums">{valueOf(c.key, row)}</dd>
                      </div>
                    ))}
                  {showSales && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Última venda</dt>
                      <dd>{row.lastSaleAt ? formatDateTime(row.lastSaleAt) : "—"}</dd>
                    </div>
                  )}
                </dl>
                {showMoney && (
                  <div className="flex items-center justify-between gap-2 border-t pt-2 text-sm">
                    <span className="text-xs text-muted-foreground">Comissão</span>
                    {commissionCell(row)}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Vendas: pedidos confirmados que a pessoa lançou (os da Shopee não contam). Produzidos:
        pedidos que a pessoa levou à Expedição.
        {showMoney && " Comissão: percentual sobre as vendas do período."}
      </p>

      {editing && (
        <EntityFormDialog
          key={editing.userId}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title={`Comissão de ${editing.name}`}
          description="Percentual sobre as vendas que a pessoa lança. Deixe vazio para não pagar comissão."
          schema={commissionSchema}
          defaultValues={{
            rate:
              editing.commissionRate === null ? "" : editing.commissionRate.toLocaleString("pt-BR"),
          }}
          fields={[
            {
              name: "rate",
              label: "Comissão (%)",
              type: "number",
              inputMode: "decimal",
              placeholder: "Ex.: 5",
            },
          ]}
          action={(values) => setCommission(editing.userId, values)}
          onSuccess={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
