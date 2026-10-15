"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

/** Barra das páginas de impressão (some no papel). */
export function PrintToolbar({
  basePath,
  ids,
  format,
  formats,
  summary,
  warnings = [],
  templates = [],
  templateId = null,
}: {
  basePath: string;
  ids: string;
  format: string;
  formats: readonly (readonly [value: string, label: string])[];
  summary: string;
  warnings?: string[];
  /** Modelos disponíveis ("graphicx" = modelo embutido). */
  templates?: { id: string; name: string }[];
  templateId?: string | null;
}) {
  const href = (f: string, modelo = templateId) =>
    `${basePath}?ids=${ids}&formato=${f}${modelo ? `&modelo=${modelo}` : ""}`;
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background px-4 py-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">{summary}</p>
        <nav aria-label="Formato" className="flex flex-wrap gap-2">
          {formats.map(([value, label]) => (
            <Link
              key={value}
              href={href(value)}
              aria-current={format === value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm md:min-h-9",
                format === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        {templates.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Modelo</span>
            <select
              className="min-h-11 rounded-full border bg-card px-3 text-sm md:min-h-9"
              value={templateId ?? "graphicx"}
              onChange={(e) => {
                window.location.href = href(format, e.target.value);
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button className="min-h-11 md:min-h-9" onClick={() => window.print()}>
          <Printer />
          Imprimir
        </Button>
      </div>
      {warnings.length > 0 && (
        <ul className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
