import { Suspense } from "react";
import { LabelSheet } from "../label-sheet";

export const metadata = { title: "Etiquetas de envio" };

/**
 * Etiquetas de envio no modelo da gráfica (balcão, WhatsApp e pedidos lançados
 * à mão). Pedidos que vieram da Shopee usam a etiqueta oficial da Shopee.
 */
export default function EnvioPage({ searchParams }: PageProps<"/imprimir/envio">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Preparando…</p>}>
      <LabelSheet kind="envio" basePath="/imprimir/envio" searchParams={searchParams} />
    </Suspense>
  );
}
