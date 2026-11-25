import { redirect } from "next/navigation";

/** A venda rápida virou o pedido de venda (Fase 9). Mantém o endereço antigo funcionando. */
export default function VendaRapidaPage() {
  redirect("/vendas/nova");
}
