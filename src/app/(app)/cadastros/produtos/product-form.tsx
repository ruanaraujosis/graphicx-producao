"use client";

import { PackagePlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityFormDialog, type FieldConfig, type FieldOption } from "@/components/kit/entity-form";
import { saveProduct } from "./actions";
import { productSchema } from "./schema";

export type ProductRow = {
  id: string;
  name: string;
  category_id: string | null;
  fulfillment: "sob_encomenda" | "pronta_entrega";
  production_days: number;
  description: string | null;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  active: boolean;
};

function fields(categories: readonly FieldOption[], editing: boolean): FieldConfig[] {
  const list: FieldConfig[] = [
    {
      name: "name",
      label: "Nome do produto",
      placeholder: "Ex.: Chaveiro de acrílico personalizado",
    },
    {
      name: "category_id",
      label: "Categoria",
      type: "select",
      half: true,
      options: [{ value: "__none", label: "Sem categoria" }, ...categories],
    },
    {
      name: "fulfillment",
      label: "Produção",
      type: "select",
      half: true,
      options: [
        { value: "sob_encomenda", label: "Sob encomenda (faz depois da venda)" },
        { value: "pronta_entrega", label: "Pronta-entrega (tem peças prontas)" },
      ],
    },
    {
      name: "production_days",
      label: "Prazo de produção (dias úteis)",
      type: "number",
      inputMode: "numeric",
      half: true,
      hint: "Vira o prazo de postagem na Shopee.",
    },
    { name: "description", label: "Descrição", type: "textarea" },
    { name: "ncm", label: "NCM", inputMode: "numeric", half: true, hint: "8 dígitos (NF-e)." },
    {
      name: "cest",
      label: "CEST",
      inputMode: "numeric",
      half: true,
      hint: "7 dígitos, se houver.",
    },
    { name: "cfop", label: "CFOP padrão", inputMode: "numeric", half: true, hint: "Ex.: 5102." },
  ];
  if (editing) list.push({ name: "active", label: "Produto ativo", type: "switch" });
  return list;
}

export function ProductFormDialog({
  product,
  categories,
}: {
  product?: ProductRow;
  categories: readonly FieldOption[];
}) {
  return (
    <EntityFormDialog
      wide
      title={product ? "Editar produto" : "Novo produto"}
      description={
        product
          ? undefined
          : "Depois de criar, você cadastra as variações, a ficha técnica e as fotos."
      }
      trigger={
        product ? (
          <Button variant="outline">
            <Pencil />
            Editar dados
          </Button>
        ) : (
          <Button>
            <PackagePlus />
            Novo produto
          </Button>
        )
      }
      schema={productSchema}
      defaultValues={{
        name: product?.name ?? "",
        category_id: product?.category_id ?? "__none",
        fulfillment: product?.fulfillment ?? "sob_encomenda",
        production_days: String(product?.production_days ?? 2),
        description: product?.description ?? "",
        ncm: product?.ncm ?? "",
        cest: product?.cest ?? "",
        cfop: product?.cfop ?? "",
        active: product?.active ?? true,
      }}
      fields={fields(categories, Boolean(product))}
      action={(values) => saveProduct(product?.id ?? null, values)}
      submitLabel={product ? "Salvar" : "Criar produto"}
    />
  );
}
