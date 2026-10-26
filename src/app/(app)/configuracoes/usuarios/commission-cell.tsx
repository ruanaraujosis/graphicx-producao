"use client";

import { Percent } from "lucide-react";
import { useRouter } from "next/navigation";
import { EntityFormDialog } from "@/components/kit/entity-form";
import { Button } from "@/components/ui/button";
import { setCommission } from "./actions";
import { commissionSchema } from "./schemas";

/** Comissão do colaborador na lista da equipe; quem gerencia o financeiro edita. */
export function CommissionCell({
  userId,
  name,
  rate,
  canEdit,
}: {
  userId: string;
  name: string;
  rate: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const label = rate === null ? "Sem comissão" : `${rate.toLocaleString("pt-BR")}%`;
  if (!canEdit)
    return (
      <span className={rate === null ? "text-muted-foreground" : "tabular-nums"}>{label}</span>
    );
  return (
    <EntityFormDialog
      title={`Comissão de ${name}`}
      description="Percentual sobre as vendas que a pessoa lança (pedidos confirmados, fora os da Shopee). Deixe vazio para não pagar comissão."
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-8"
          aria-label={`Definir comissão de ${name}`}
        >
          <Percent />
          {label}
        </Button>
      }
      schema={commissionSchema}
      defaultValues={{ rate: rate === null ? "" : rate.toLocaleString("pt-BR") }}
      fields={[
        {
          name: "rate",
          label: "Comissão (%)",
          type: "number",
          inputMode: "decimal",
          placeholder: "Ex.: 5",
        },
      ]}
      action={(values) => setCommission(userId, values)}
      onSuccess={() => router.refresh()}
    />
  );
}
