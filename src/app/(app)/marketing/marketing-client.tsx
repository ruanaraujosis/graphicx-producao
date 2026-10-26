"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmButton } from "@/components/kit/confirm-button";
import { EntityFormDialog } from "@/components/kit/entity-form";
import { type PickerOption, SearchPicker } from "@/components/kit/search-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/crud";
import { REPLY_FIELDS } from "@/lib/marketplaces/replies";
import { z } from "zod";
import {
  addBoostItem,
  customizeDefaultTemplates,
  deleteReplyTemplate,
  ignoreReview,
  moveBoostItem,
  removeBoostItem,
  saveMarketingSettings,
  saveReplyTemplate,
  sendReviewReply,
  syncReviewsNow,
  toggleBoostItem,
} from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });
  return [pending, run] as const;
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-4",
            n <= rating ? "fill-warning text-warning" : "text-muted-foreground/40",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Ajustes
// -----------------------------------------------------------------------------
export function MarketingSettings({
  shopId,
  initial,
  canManage,
}: {
  shopId: string;
  initial: { boost_enabled: boolean; review_auto_reply: boolean; review_signature: string };
  canManage: boolean;
}) {
  const [boost, setBoost] = useState(initial.boost_enabled);
  const [auto, setAuto] = useState(initial.review_auto_reply);
  const [signature, setSignature] = useState(initial.review_signature);
  const [pending, run] = useRun();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="font-heading text-sm font-semibold">Ajustes da loja</h2>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Switch checked={boost} onCheckedChange={setBoost} disabled={!canManage} />
        Impulsionar anúncios a cada 4 horas
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Switch checked={auto} onCheckedChange={setAuto} disabled={!canManage} />
        Responder sozinho as avaliações de 4 e 5 estrelas
      </label>
      <div className="flex flex-col gap-1">
        <Label htmlFor="mk-signature">Assinatura nas respostas</Label>
        <Input
          id="mk-signature"
          value={signature}
          maxLength={60}
          disabled={!canManage}
          placeholder="Ex.: Equipe Smart Gráfica"
          onChange={(e) => setSignature(e.target.value)}
          className="min-h-11 md:min-h-9"
        />
        <p className="text-xs text-muted-foreground">Vai no lugar de {"{loja}"} nos modelos.</p>
      </div>
      {canManage && (
        <Button
          className="min-h-11 self-start md:min-h-9"
          disabled={pending}
          onClick={() =>
            run(() =>
              saveMarketingSettings(shopId, {
                boost_enabled: boost,
                review_auto_reply: auto,
                review_signature: signature,
              }),
            )
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar ajustes
        </Button>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Avaliações
// -----------------------------------------------------------------------------
export function SyncReviewsButton({ shopId }: { shopId: string }) {
  const [pending, run] = useRun();
  return (
    <Button
      variant="outline"
      className="min-h-11 md:min-h-9"
      disabled={pending}
      onClick={() => run(() => syncReviewsNow(shopId))}
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      Buscar avaliações
    </Button>
  );
}

export function ReviewReply({
  reviewId,
  initial,
  editable,
}: {
  reviewId: string;
  initial: string;
  editable: boolean;
}) {
  const [text, setText] = useState(initial);
  const [sending, runSend] = useRun();
  const [ignoring, runIgnore] = useRun();
  if (!editable) {
    return initial ? (
      <p className="rounded-xl bg-muted px-3 py-2 text-sm whitespace-pre-line">{initial}</p>
    ) : null;
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`reply-${reviewId}`} className="text-xs text-muted-foreground">
        Resposta sugerida (edite antes de enviar)
      </Label>
      <Textarea
        id={`reply-${reviewId}`}
        rows={3}
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="min-h-11 md:min-h-8"
          disabled={sending || !text.trim()}
          onClick={() => runSend(() => sendReviewReply(reviewId, text))}
        >
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar resposta
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 md:min-h-8"
          disabled={ignoring}
          onClick={() => runIgnore(() => ignoreReview(reviewId))}
        >
          <EyeOff />
          Ignorar
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {text.length}/500
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Impulsionamento
// -----------------------------------------------------------------------------
export function AddBoostItem({ shopId, options }: { shopId: string; options: PickerOption[] }) {
  const [text, setText] = useState("");
  const [pending, run] = useRun();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="boost-add">Adicionar anúncio à lista</Label>
      <SearchPicker
        id="boost-add"
        value={text}
        onTextChange={setText}
        onPick={(o) =>
          run(
            () => addBoostItem(shopId, o.value),
            () => setText(""),
          )
        }
        search={(q) => {
          const term = q.trim().toLowerCase();
          return options.filter((o) => !term || o.label.toLowerCase().includes(term));
        }}
        placeholder={pending ? "Adicionando…" : "Buscar anúncio da loja"}
        ariaLabel="Buscar anúncio para impulsionar"
        emptyText="Nenhum anúncio encontrado. Importe os anúncios em Integrações."
      />
    </div>
  );
}

export function BoostRowActions({
  id,
  active,
  first,
  last,
}: {
  id: string;
  active: boolean;
  first: boolean;
  last: boolean;
}) {
  const [pending, run] = useRun();
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:size-8"
        aria-label="Subir na prioridade"
        disabled={pending || first}
        onClick={() => run(() => moveBoostItem(id, "up"))}
      >
        <ArrowUp />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:size-8"
        aria-label="Descer na prioridade"
        disabled={pending || last}
        onClick={() => run(() => moveBoostItem(id, "down"))}
      >
        <ArrowDown />
      </Button>
      <Switch
        checked={active}
        disabled={pending}
        aria-label={active ? "Pausar este anúncio" : "Voltar a impulsionar"}
        onCheckedChange={(v) => run(() => toggleBoostItem(id, v))}
      />
      <ConfirmButton
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-destructive md:size-8"
            aria-label="Tirar da lista"
          >
            <Trash2 />
          </Button>
        }
        title="Tirar este anúncio da lista?"
        description="Ele deixa de ser impulsionado automaticamente."
        confirmLabel="Tirar"
        action={() => removeBoostItem(id)}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Modelos de resposta
// -----------------------------------------------------------------------------
const templateFormSchema = z.object({
  min_stars: z.string(),
  max_stars: z.string(),
  body: z.string().trim().min(5, "Escreva o texto da resposta.").max(500, "Até 500 caracteres."),
});

const STAR_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: `${n} estrela${n > 1 ? "s" : ""}`,
}));

function templateFields() {
  return [
    { name: "min_stars", label: "De", type: "select" as const, options: STAR_OPTIONS, half: true },
    { name: "max_stars", label: "Até", type: "select" as const, options: STAR_OPTIONS, half: true },
    {
      name: "body",
      label: "Resposta",
      type: "textarea" as const,
      hint: `Campos: ${REPLY_FIELDS.map((f) => `{${f.key}} = ${f.label.toLowerCase()}`).join("; ")}.`,
    },
  ];
}

export function TemplateDialog({
  template,
}: {
  template?: { id: string; min_stars: number; max_stars: number; body: string };
}) {
  return (
    <EntityFormDialog
      title={template ? "Editar modelo de resposta" : "Novo modelo de resposta"}
      trigger={
        template ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 md:size-8"
            aria-label="Editar modelo"
          >
            <Pencil />
          </Button>
        ) : (
          <Button className="min-h-11 md:min-h-9">
            <Plus />
            Novo modelo
          </Button>
        )
      }
      schema={templateFormSchema}
      defaultValues={{
        min_stars: String(template?.min_stars ?? 5),
        max_stars: String(template?.max_stars ?? 5),
        body: template?.body ?? "",
      }}
      fields={templateFields()}
      action={(values) => saveReplyTemplate(template?.id ?? null, values)}
    />
  );
}

export function DeleteTemplateButton({ id }: { id: string }) {
  return (
    <ConfirmButton
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="size-11 text-destructive md:size-8"
          aria-label="Excluir modelo"
        >
          <Trash2 />
        </Button>
      }
      title="Excluir este modelo?"
      description="Se a faixa ficar sem modelo, vale o padrão do GraphicX."
      confirmLabel="Excluir"
      action={() => deleteReplyTemplate(id)}
    />
  );
}

export function CustomizeDefaultsButton() {
  const [pending, run] = useRun();
  return (
    <Button
      variant="outline"
      className="min-h-11 md:min-h-9"
      disabled={pending}
      onClick={() => run(() => customizeDefaultTemplates())}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Copy />}
      Personalizar os modelos padrão
    </Button>
  );
}
