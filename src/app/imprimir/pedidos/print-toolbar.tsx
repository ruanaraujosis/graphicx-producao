"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

/** Barra de impressão (some no papel). */
export function PrintToolbar({
  ids,
  format,
  count,
}: {
  ids: string;
  format: "etiqueta" | "a4";
  count: number;
}) {
  const href = (f: string) => `/imprimir/pedidos?ids=${ids}&formato=${f}`;
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background px-4 py-3 print:hidden">
      <p className="mr-auto text-sm text-muted-foreground">
        {count} {count === 1 ? "etiqueta" : "etiquetas"} de identificação
      </p>
      <nav aria-label="Formato" className="flex gap-2">
        {(
          [
            ["etiqueta", "Etiqueta 10×15 cm"],
            ["a4", "Folha A4 (8 por folha)"],
          ] as const
        ).map(([value, label]) => (
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
      <Button className="min-h-11 md:min-h-9" onClick={() => window.print()}>
        <Printer />
        Imprimir
      </Button>
    </div>
  );
}
