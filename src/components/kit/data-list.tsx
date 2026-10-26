import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAGE_SIZE } from "@/lib/list-params";

export type Column<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Some no card do celular (o card já mostra título, subtítulo e "extras"). */
  tableOnly?: boolean;
};

/**
 * Lista responsiva: cards no celular/tablet e tabela em telas largas.
 * Componente de servidor — as funções de célula não vão para o navegador.
 */
export function DataList<T>({
  rows,
  rowKey,
  columns,
  card,
  actions,
  empty,
  muted,
}: {
  rows: readonly T[];
  rowKey: (row: T) => string;
  columns: readonly Column<T>[];
  card: {
    title: (row: T) => React.ReactNode;
    subtitle?: (row: T) => React.ReactNode;
    extra?: (row: T) => React.ReactNode;
  };
  actions?: (row: T) => React.ReactNode;
  empty: React.ReactNode;
  /** Linha esmaecida (ex.: inativo). */
  muted?: (row: T) => boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm",
              muted?.(row) && "opacity-70",
            )}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{card.title(row)}</div>
                {card.subtitle && (
                  <div className="truncate text-xs text-muted-foreground">{card.subtitle(row)}</div>
                )}
              </div>
              {actions?.(row)}
            </div>
            {card.extra && (
              <div className="flex flex-wrap items-center gap-2">{card.extra(row)}</div>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => (
                <TableHead key={col.header} className={cn(i === 0 && "pl-5", col.className)}>
                  {col.header}
                </TableHead>
              ))}
              {actions && (
                <TableHead className="w-16 pr-5 text-right">
                  <span className="sr-only">Ações</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className={cn(muted?.(row) && "opacity-70")}>
                {columns.map((col, i) => (
                  <TableCell key={col.header} className={cn(i === 0 && "pl-5", col.className)}>
                    {col.cell(row)}
                  </TableCell>
                ))}
                {actions && <TableCell className="pr-5 text-right">{actions(row)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** Paginação por links (?pagina=), preservando a busca. */
export function Pagination({
  basePath,
  page,
  total,
  q,
  params: extra,
}: {
  basePath: string;
  page: number;
  total: number;
  q?: string;
  /** Outros filtros da URL a preservar. */
  params?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extra ?? {})) if (v) params.set(k, v);
    if (q) params.set("q", q);
    if (p > 1) params.set("pagina", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const linkClass =
    "inline-flex min-h-11 items-center gap-1 rounded-xl border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9";

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        Página {page} de {pages} · {total} {total === 1 ? "registro" : "registros"}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} className={linkClass}>
            <ChevronLeft className="size-4" aria-hidden />
            Anterior
          </Link>
        )}
        {page < pages && (
          <Link href={href(page + 1)} className={linkClass}>
            Próxima
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </nav>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "success" | "warning" | "danger" | "info" | "secondary" | "accent";
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-info-soft text-info",
    secondary: "bg-secondary text-secondary-foreground",
    accent: "bg-accent text-accent-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-full px-2.5 text-xs font-medium",
        tones[tone],
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
