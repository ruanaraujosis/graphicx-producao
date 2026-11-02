"use client";

import { Download, UserX } from "lucide-react";
import { ConfirmButton } from "@/components/kit/confirm-button";
import { Button } from "@/components/ui/button";
import { anonymizeCustomer } from "./actions";

/** Pedidos do titular pela LGPD: exportar os dados e anonimizar o cadastro. */
export function CustomerPrivacyActions({ customer }: { customer: { id: string; name: string } }) {
  return (
    <>
      <Button variant="ghost" size="icon" asChild>
        <a
          href={`/cadastros/clientes/${customer.id}/dados`}
          download
          aria-label={`Exportar os dados de ${customer.name} (LGPD)`}
          title="Exportar dados (LGPD)"
        >
          <Download />
        </a>
      </Button>
      <ConfirmButton
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Anonimizar ${customer.name} (LGPD)`}
            title="Anonimizar (LGPD)"
          >
            <UserX />
          </Button>
        }
        title={`Anonimizar ${customer.name}?`}
        description="Use quando o cliente pedir a exclusão dos dados dele. Nome, CPF/CNPJ, contatos, endereço e observações são apagados do cadastro, dos pedidos, do financeiro e do histórico. Pedidos e valores continuam para os relatórios. Não dá para desfazer. Os arquivos de arte não são apagados."
        confirmLabel="Anonimizar"
        action={() => anonymizeCustomer(customer.id)}
      />
    </>
  );
}
