"use client";

import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityFormDialog, type FieldConfig } from "@/components/kit/entity-form";
import { CHANNEL_LABELS, SALES_CHANNELS, type SalesChannel } from "@/lib/catalog/pricing";
import { formatCep, formatDocument, formatPhone, UF_LIST } from "@/lib/documents";
import { saveCustomer } from "./actions";
import { customerSchema } from "./schema";

export type CustomerRow = {
  id: string;
  person_type: "pf" | "pj";
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  origin: SalesChannel;
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

const isPj = (v: Record<string, unknown>) => v.person_type === "pj";

/** Campos do cadastro de cliente (também usados ao criar o pedido). */
export const CUSTOMER_FIELDS: FieldConfig[] = [
  {
    name: "person_type",
    label: "Tipo",
    type: "select",
    half: true,
    options: [
      { value: "pf", label: "Pessoa física" },
      { value: "pj", label: "Pessoa jurídica" },
    ],
  },
  {
    name: "origin",
    label: "Origem",
    type: "select",
    half: true,
    options: SALES_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] })),
  },
  { name: "name", label: "Nome", placeholder: "Nome ou nome fantasia" },
  { name: "legal_name", label: "Razão social", showWhen: isPj },
  {
    name: "document",
    label: "CPF ou CNPJ",
    inputMode: "numeric",
    hint: "Opcional. Necessário para emitir NF-e.",
  },
  { name: "email", label: "E-mail", type: "email", half: true },
  { name: "whatsapp", label: "WhatsApp", type: "tel", half: true, placeholder: "(11) 98765-4321" },
  { name: "phone", label: "Telefone", type: "tel", half: true },
  { name: "cep", label: "CEP", type: "cep", half: true, hint: "Preenche o endereço sozinho." },
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
  { name: "notes", label: "Observações", type: "textarea" },
];

const ACTIVE_FIELD: FieldConfig = {
  name: "active",
  label: "Cliente ativo",
  type: "switch",
  hint: "Inativos somem das buscas de pedidos.",
};

export function customerFormValues(c?: Partial<CustomerRow>) {
  return {
    person_type: c?.person_type ?? "pf",
    origin: c?.origin ?? "balcao",
    name: c?.name ?? "",
    legal_name: c?.legal_name ?? "",
    document: formatDocument(c?.document),
    email: c?.email ?? "",
    whatsapp: formatPhone(c?.whatsapp),
    phone: formatPhone(c?.phone),
    cep: formatCep(c?.cep),
    street: c?.street ?? "",
    number: c?.number ?? "",
    complement: c?.complement ?? "",
    district: c?.district ?? "",
    city: c?.city ?? "",
    state: c?.state ?? "",
    notes: c?.notes ?? "",
    active: c?.active ?? true,
  };
}

export function CustomerFormDialog({ customer }: { customer?: CustomerRow }) {
  return (
    <EntityFormDialog
      wide
      title={customer ? "Editar cliente" : "Novo cliente"}
      trigger={
        customer ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${customer.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <UserPlus />
            Novo cliente
          </Button>
        )
      }
      schema={customerSchema}
      defaultValues={customerFormValues(customer)}
      fields={customer ? [...CUSTOMER_FIELDS, ACTIVE_FIELD] : CUSTOMER_FIELDS}
      action={(values) => saveCustomer(customer?.id ?? null, values)}
      submitLabel={customer ? "Salvar" : "Cadastrar cliente"}
    />
  );
}
