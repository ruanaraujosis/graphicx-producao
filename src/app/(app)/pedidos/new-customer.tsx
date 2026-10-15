"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";
import { CUSTOMER_FIELDS, customerFormValues } from "@/app/(app)/cadastros/clientes/customer-form";
import { customerSchema } from "@/app/(app)/cadastros/clientes/schema";
import { EntityFormDialog } from "@/components/kit/entity-form";
import { Button } from "@/components/ui/button";
import type { SalesChannel } from "@/lib/catalog/pricing";
import { digits } from "@/lib/documents";
import { createCustomerFromOrder } from "./actions";

/**
 * "Cadastrar cliente" dentro do pedido: abre o cadastro completo já com o nome,
 * o WhatsApp e o canal digitados; ao salvar, o cliente fica selecionado no pedido.
 */
export function NewCustomerButton({
  name,
  phone,
  channel,
  onCreated,
}: {
  name: string;
  phone: string;
  channel: SalesChannel;
  onCreated: (customer: { id: string; name: string; phone: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  // Remonta o formulário a cada abertura para pegar o que foi digitado no pedido.
  const [round, setRound] = useState(0);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 self-start md:min-h-8"
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        <UserPlus />
        Cadastrar cliente
      </Button>
      <EntityFormDialog
        key={round}
        wide
        open={open}
        onOpenChange={setOpen}
        title="Novo cliente"
        description="O cliente fica salvo em Cadastros e já entra neste pedido."
        schema={customerSchema}
        defaultValues={customerFormValues({
          name: name.trim(),
          whatsapp: digits(phone) || null,
          origin: channel,
        })}
        fields={CUSTOMER_FIELDS}
        submitLabel="Cadastrar e usar no pedido"
        action={async (values) => {
          const result = await createCustomerFromOrder(values);
          if (result.ok) {
            onCreated({
              id: result.data.id,
              name: String(values.name ?? "").trim(),
              phone: String(values.whatsapp || values.phone || ""),
            });
          }
          return result;
        }}
      />
    </>
  );
}
