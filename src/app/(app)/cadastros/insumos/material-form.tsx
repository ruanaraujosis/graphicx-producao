"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityFormDialog, type FieldConfig, type FieldOption } from "@/components/kit/entity-form";
import { UNIT_LABELS, UNITS, type Unit } from "@/lib/stock/units";
import { saveMaterial } from "./actions";
import { materialSchema } from "./schema";

export type MaterialRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: Unit;
  min_stock: number;
  supplier_id: string | null;
  notes: string | null;
  active: boolean;
};

function fields(suppliers: readonly FieldOption[], editing: boolean): FieldConfig[] {
  const list: FieldConfig[] = [
    { name: "name", label: "Nome", placeholder: "Ex.: Papel sulfite 75g A4" },
    { name: "sku", label: "Código (opcional)", half: true, placeholder: "PAP-75-A4" },
    {
      name: "unit",
      label: "Unidade de medida",
      type: "select",
      half: true,
      options: UNITS.map((u) => ({ value: u, label: `${UNIT_LABELS[u]} (${u})` })),
    },
    {
      name: "min_stock",
      label: "Estoque mínimo",
      type: "number",
      half: true,
      hint: "Abaixo disso, aparece o alerta e a sugestão de compra.",
    },
    {
      name: "supplier_id",
      label: "Fornecedor padrão",
      type: "select",
      half: true,
      options: [{ value: "__none", label: "Nenhum" }, ...suppliers],
    },
    { name: "notes", label: "Observações", type: "textarea" },
  ];
  if (editing) list.push({ name: "active", label: "Insumo ativo", type: "switch" });
  return list;
}

export function MaterialFormDialog({
  material,
  suppliers,
}: {
  material?: MaterialRow;
  suppliers: readonly FieldOption[];
}) {
  return (
    <EntityFormDialog
      title={material ? "Editar insumo" : "Novo insumo"}
      description="O custo é calculado pelas entradas no estoque (custo médio ponderado)."
      trigger={
        material ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${material.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Novo insumo
          </Button>
        )
      }
      schema={materialSchema}
      defaultValues={{
        name: material?.name ?? "",
        sku: material?.sku ?? "",
        unit: material?.unit ?? "un",
        min_stock: String(material?.min_stock ?? 0).replace(".", ","),
        supplier_id: material?.supplier_id ?? "__none",
        notes: material?.notes ?? "",
        active: material?.active ?? true,
      }}
      fields={fields(suppliers, Boolean(material))}
      action={(values) => saveMaterial(material?.id ?? null, values)}
      submitLabel={material ? "Salvar" : "Cadastrar insumo"}
    />
  );
}
