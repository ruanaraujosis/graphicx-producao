"use client";

import { Pencil } from "lucide-react";
import { EntityFormDialog } from "@/components/kit/entity-form";
import { Button } from "@/components/ui/button";
import { formatCep, formatPhone, UF_LIST } from "@/lib/documents";
import { saveOrganizationData } from "./actions";
import { organizationProfileSchema } from "./schema";

export type OrganizationProfile = {
  name: string;
  legal_name: string | null;
  document: string | null;
  phone: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

export function OrganizationDataDialog({ organization }: { organization: OrganizationProfile }) {
  const o = organization;
  return (
    <EntityFormDialog
      wide
      title="Dados da gráfica"
      description="O nome aparece para a equipe e para os clientes nos links de arte. O endereço é o remetente das etiquetas de envio."
      trigger={
        <Button>
          <Pencil />
          Editar dados
        </Button>
      }
      schema={organizationProfileSchema}
      defaultValues={{
        name: o.name,
        legal_name: o.legal_name ?? "",
        document: o.document ?? "",
        phone: formatPhone(o.phone),
        cep: formatCep(o.cep),
        street: o.street ?? "",
        number: o.number ?? "",
        complement: o.complement ?? "",
        district: o.district ?? "",
        city: o.city ?? "",
        state: o.state ?? "",
      }}
      fields={[
        { name: "name", label: "Nome da gráfica" },
        { name: "legal_name", label: "Razão social" },
        { name: "document", label: "CNPJ", inputMode: "numeric", half: true },
        { name: "phone", label: "Telefone", type: "tel", half: true },
        {
          name: "cep",
          label: "CEP",
          type: "cep",
          half: true,
          hint: "Preenche o endereço sozinho.",
        },
        { name: "street", label: "Rua" },
        { name: "number", label: "Número", half: true },
        { name: "complement", label: "Complemento", half: true },
        { name: "district", label: "Bairro", half: true },
        { name: "city", label: "Cidade", half: true },
        {
          name: "state",
          label: "UF",
          type: "select",
          half: true,
          options: UF_LIST.map((uf) => ({ value: uf, label: uf })),
        },
      ]}
      action={saveOrganizationData}
    />
  );
}
