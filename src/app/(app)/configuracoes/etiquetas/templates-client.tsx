"use client";

import { Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/kit/confirm-button";
import { Button } from "@/components/ui/button";
import type { LabelKind } from "@/lib/labels/template";
import { deleteTemplate, setDefaultTemplate, resetToBuiltinTemplate } from "./actions";

export function MakeDefaultButton({ id, kind }: { id: string | null; kind: LabelKind }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 md:min-h-8"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = id ? await setDefaultTemplate(id) : await resetToBuiltinTemplate(kind);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <Star />
      Usar como padrão
    </Button>
  );
}

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton
      trigger={
        <Button variant="ghost" size="sm" className="min-h-11 text-destructive md:min-h-8">
          <Trash2 />
          Excluir
        </Button>
      }
      title={`Excluir o modelo “${name}”?`}
      description="As próximas impressões passam a usar o modelo padrão."
      confirmLabel="Excluir"
      action={() => deleteTemplate(id)}
    />
  );
}
