import { Suspense } from "react";
import { LabelSheet } from "../label-sheet";

export const metadata = { title: "Etiquetas de identificação" };

/** Etiquetas de identificação dos pedidos (QR Code), no modelo da gráfica. */
export default function EtiquetasPage({ searchParams }: PageProps<"/imprimir/pedidos">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Preparando…</p>}>
      <LabelSheet kind="identificacao" basePath="/imprimir/pedidos" searchParams={searchParams} />
    </Suspense>
  );
}
