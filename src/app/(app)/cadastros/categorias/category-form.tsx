"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/kit/confirm-button";
import { EntityFormDialog } from "@/components/kit/entity-form";
import { deleteCategory, saveCategory } from "./actions";
import { categorySchema } from "./schema";

export function CategoryFormDialog({ category }: { category?: { id: string; name: string } }) {
  return (
    <EntityFormDialog
      title={category ? "Renomear categoria" : "Nova categoria"}
      trigger={
        category ? (
          <Button variant="ghost" size="icon" aria-label={`Renomear ${category.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Nova categoria
          </Button>
        )
      }
      schema={categorySchema}
      defaultValues={{ name: category?.name ?? "" }}
      fields={[{ name: "name", label: "Nome", placeholder: "Ex.: Chaveiros de acrílico" }]}
      action={(values) => saveCategory(category?.id ?? null, values)}
      submitLabel={category ? "Salvar" : "Criar categoria"}
    />
  );
}

export function DeleteCategoryButton({
  category,
  products,
}: {
  category: { id: string; name: string };
  products: number;
}) {
  return (
    <ConfirmButton
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Excluir ${category.name}`}>
          <Trash2 />
        </Button>
      }
      title={`Excluir a categoria ${category.name}?`}
      description={
        products > 0
          ? `${products} produto(s) estão nela e ficarão sem categoria. Eles não são apagados.`
          : "Nenhum produto usa esta categoria."
      }
      confirmLabel="Excluir"
      action={() => deleteCategory(category.id)}
    />
  );
}
