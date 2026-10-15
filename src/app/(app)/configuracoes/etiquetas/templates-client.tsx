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

export function DeleteTemplateButton({
  id,
  name,
  redirectTo,
}: {
  id: string;
  name: string;
  /** Para onde ir depois de excluir (no editor, volta para a lista). */
  redirectTo?: string;
}) {
  const router = useRouter();
  return (
    <ConfirmButton
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10 md:min-h-8"
        >
          <Trash2 />
          Excluir
        </Button>
      }
      title={`Excluir o modelo “${name}”?`}
      description="As próximas impressões passam a usar o modelo padrão."
      confirmLabel="Excluir"
      action={async () => {
        const r = await deleteTemplate(id);
        if (r.ok && redirectTo) router.push(redirectTo);
        return r;
      }}
    />
  );
}
