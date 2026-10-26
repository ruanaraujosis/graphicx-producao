import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botões de exportação (CSV e Excel) do relatório atual, com os mesmos filtros da tela. */
export function ExportLinks({
  report,
  params,
}: {
  report: "receber" | "pagar" | "caixa" | "dre" | "margem";
  params?: Record<string, string | undefined>;
}) {
  const href = (format: "csv" | "xlsx") => {
    const p = new URLSearchParams({ relatorio: report, formato: format });
    for (const [k, v] of Object.entries(params ?? {})) if (v) p.set(k, v);
    return `/financeiro/exportar?${p}`;
  };
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" asChild className="min-h-11 md:min-h-8">
        <a href={href("csv")} download>
          <Download />
          CSV
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild className="min-h-11 md:min-h-8">
        <a href={href("xlsx")} download>
          <Download />
          Excel
        </a>
      </Button>
    </div>
  );
}
