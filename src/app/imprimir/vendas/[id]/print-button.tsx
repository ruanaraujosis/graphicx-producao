"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Barra do documento (some no papel): imprimir ou salvar em PDF pelo navegador. */
export function PrintButton({ summary }: { summary: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-3 print:hidden">
      <p className="mr-auto text-sm text-muted-foreground">
        {summary} · para salvar em PDF, escolha “Salvar como PDF” na janela de impressão.
      </p>
      <Button className="min-h-11 md:min-h-9" onClick={() => window.print()}>
        <Printer />
        Imprimir
      </Button>
    </div>
  );
}
