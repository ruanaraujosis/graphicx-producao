"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityFormDialog, type FieldConfig } from "@/components/kit/entity-form";
import { formatCep, formatDocument, formatPhone, UF_LIST } from "@/lib/documents";
import { saveSupplier } from "./actions";
import { supplierSchema } from "./schema";

export type SupplierRow = {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  active: boolean;
};

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Nome", placeholder: "Nome fantasia" },
  { name: "legal_name", label: "Razão social" },
  { name: "document", label: "CNPJ ou CPF", inputMode: "numeric", half: true },
  { name: "contact_name", label: "Contato", half: true, placeholder: "Quem atende" },
  { name: "email", label: "E-mail", type: "email", half: true },
  { name: "phone", label: "Telefone/WhatsApp", type: "tel", half: true },
  { name: "cep", label: "CEP", type: "cep", half: true },
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
  { name: "notes", label: "Observações", type: "textarea", placeholder: "Prazos, condições..." },
];

function toForm(s?: SupplierRow) {
  return {
    name: s?.name ?? "",
    legal_name: s?.legal_name ?? "",
    document: formatDocument(s?.document),
    contact_name: s?.contact_name ?? "",
    email: s?.email ?? "",
    phone: formatPhone(s?.phone),
    cep: formatCep(s?.cep),
    street: s?.street ?? "",
    number: s?.number ?? "",
    complement: s?.complement ?? "",
    district: s?.district ?? "",
    city: s?.city ?? "",
    state: s?.state ?? "",
    notes: s?.notes ?? "",
    active: s?.active ?? true,
  };
}

export function SupplierFormDialog({ supplier }: { supplier?: SupplierRow }) {
  return (
    <EntityFormDialog
      wide
      title={supplier ? "Editar fornecedor" : "Novo fornecedor"}
      trigger={
        supplier ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${supplier.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Novo fornecedor
          </Button>
        )
      }
      schema={supplierSchema}
      defaultValues={toForm(supplier)}
      fields={
        supplier
          ? [...FIELDS, { name: "active", label: "Fornecedor ativo", type: "switch" }]
          : FIELDS
      }
      action={(values) => saveSupplier(supplier?.id ?? null, values)}
      submitLabel={supplier ? "Salvar" : "Cadastrar fornecedor"}
    />
  );
}
