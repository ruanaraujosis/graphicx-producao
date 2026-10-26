"use client";

import { Download, Loader2, Send, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type PickerOption, SearchPicker } from "@/components/kit/search-picker";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/crud";
import { importListings, linkListing, pushStockNow } from "../../actions";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  return [pending, run] as const;
}

export function ListingsToolbar({ shopId }: { shopId: string }) {
  const [importing, runImport] = useAction();
  const [pushing, runPush] = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        className="min-h-11 md:min-h-9"
        disabled={importing}
        onClick={() => runImport(() => importListings(shopId))}
      >
        {importing ? <Loader2 className="animate-spin" /> : <Download />}
        Importar anúncios
      </Button>
      <Button
        className="min-h-11 md:min-h-9"
        disabled={pushing}
        onClick={() => runPush(() => pushStockNow(shopId))}
      >
        {pushing ? <Loader2 className="animate-spin" /> : <Send />}
        Enviar estoque e preços
      </Button>
    </div>
  );
}

/** Escolhe a variação do cadastro ligada ao anúncio. */
export function LinkPicker({
  listingId,
  current,
  variants,
  canManage,
}: {
  listingId: string;
  current: PickerOption | null;
  variants: PickerOption[];
  canManage: boolean;
}) {
  const [text, setText] = useState("");
  const [pending, run] = useAction();

  if (!canManage) {
    return current ? (
      <span className="text-sm">{current.label}</span>
    ) : (
      <span className="text-sm text-muted-foreground">Sem vínculo</span>
    );
  }
  if (current) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 truncate text-sm" title={current.hint}>
          {current.label}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 md:size-8"
          aria-label="Remover vínculo"
          disabled={pending}
          onClick={() => run(() => linkListing(listingId, null))}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Unlink />}
        </Button>
      </div>
    );
  }
  return (
    <SearchPicker
      value={text}
      onTextChange={setText}
      onPick={(o) => {
        setText("");
        run(() => linkListing(listingId, o.value));
      }}
      search={(q) => {
        const term = q.trim().toLowerCase();
        return variants.filter(
          (v) =>
            !term || v.label.toLowerCase().includes(term) || v.hint?.toLowerCase().includes(term),
        );
      }}
      placeholder={pending ? "Vinculando…" : "Buscar SKU ou produto"}
      ariaLabel="Vincular a uma variação do cadastro"
      emptyText="Nenhuma variação encontrada."
      className="min-w-56"
    />
  );
}
