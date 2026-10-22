"use client";

import {
  ArrowRight,
  Ban,
  ChevronDown,
  Copy,
  Download,
  Link2,
  Link2Off,
  Loader2,
  MessageCircle,
  Send,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ART_BUCKET, MAX_ART_FILE_BYTES, MAX_PROOF_BYTES, type ArtFolder } from "@/lib/art/files";
import type { Permission } from "@/lib/auth/permissions";
import { digits } from "@/lib/documents";
import {
  ORDER_STATUSES,
  STATUS_LABELS,
  canSetStatus,
  nextStatus,
  type OrderStatus,
} from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/client";
import { addOrderComment, changeOrderStatus } from "../actions";
import {
  artDownloadUrl,
  attachClientFile,
  attachFinalFile,
  createArtLink,
  prepareArtUpload,
  publishProof,
  revokeArtLink,
} from "./art-actions";

// -----------------------------------------------------------------------------
// Status
// -----------------------------------------------------------------------------
export function StatusActions({
  orderId,
  status,
  needsArt,
  permissions,
}: {
  orderId: string;
  status: OrderStatus;
  needsArt: boolean;
  permissions: readonly Permission[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();

  const next = nextStatus(status, needsArt);
  const canNext = next !== null && canSetStatus(permissions, status, next);
  const options = ORDER_STATUSES.filter(
    (s) => s !== "cancelado" && s !== status && canSetStatus(permissions, status, s),
  );
  const canCancel = status !== "cancelado" && canSetStatus(permissions, status, "cancelado");

  function move(to: OrderStatus, note?: string) {
    startTransition(async () => {
      const result = await changeOrderStatus(orderId, to, note);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Pedido em ${STATUS_LABELS[to]}.`);
      setCancelOpen(false);
      router.refresh();
    });
  }

  if (!canNext && options.length === 0 && !canCancel) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {canNext && next && (
        <Button onClick={() => move(next)} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          {status === "orcamento" ? "Aprovar orçamento" : `Avançar: ${STATUS_LABELS[next]}`}
        </Button>
      )}
      {(options.length > 0 || canCancel) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={pending}>
              Mudar status
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-60 overflow-auto">
            <DropdownMenuLabel>Mover para</DropdownMenuLabel>
            {options.map((s) => (
              <DropdownMenuItem key={s} className="min-h-11 md:min-h-8" onSelect={() => move(s)}>
                {STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
            {canCancel && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  className="min-h-11 md:min-h-8"
                  onSelect={() => setCancelOpen(true)}
                >
                  <Ban />
                  Cancelar pedido
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
            <DialogDescription>
              As reservas de estoque voltam para o disponível. O que já foi baixado na produção
              continua baixado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>Motivo</Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: cliente desistiu"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < 3}
              onClick={() => move("cancelado", reason)}
            >
              {pending && <Loader2 className="animate-spin" />}
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Link do cliente
// -----------------------------------------------------------------------------
const subscribeNothing = () => () => {};

export function ArtLinkBox({
  orderId,
  orderLabel,
  orgName,
  customerName,
  customerPhone,
  link,
  canManage,
}: {
  orderId: string;
  orderLabel: string;
  orgName: string;
  customerName: string;
  customerPhone: string | null;
  link: { id: string; token: string; expires_at: string } | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // O endereço vem do navegador: funciona em qualquer domínio (produção ou preview).
  const origin = useSyncExternalStore(
    subscribeNothing,
    () => window.location.origin,
    () => "",
  );
  const url = link ? `${origin}/a/${link.token}` : "";
  const firstName = customerName.split(" ")[0];
  const message = `Olá, ${firstName}! Aqui é da ${orgName}. Pelo link abaixo você envia a arte do pedido ${orderLabel} e aprova a prova antes da produção:\n${url}`;
  const phone = customerPhone ? digits(customerPhone) : "";
  const waUrl = `https://wa.me/${phone ? (phone.length <= 11 ? `55${phone}` : phone) : ""}?text=${encodeURIComponent(message)}`;

  function generate() {
    startTransition(async () => {
      const r = await createArtLink(orderId);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(link ? "Novo link gerado. O anterior parou de funcionar." : "Link gerado.");
        router.refresh();
      }
    });
  }

  function revoke() {
    if (!link) return;
    startTransition(async () => {
      const r = await revokeArtLink(orderId, link.id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.refresh();
      }
    });
  }

  if (!link) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-4">
        <p className="text-sm text-muted-foreground">
          Gere um link para o cliente enviar a arte e aprovar a prova pelo celular, sem login.
        </p>
        {canManage && (
          <Button onClick={generate} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Link2 />}
            Gerar link do cliente
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4">
      <p className="truncate font-mono text-xs text-muted-foreground" title={url}>
        {url || "…"}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={waUrl} target="_blank" rel="noreferrer">
            <MessageCircle />
            Enviar pelo WhatsApp
          </a>
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast.success("Link copiado.");
          }}
        >
          <Copy />
          Copiar link
        </Button>
        {canManage && (
          <>
            <Button variant="ghost" onClick={generate} disabled={pending}>
              <Link2 />
              Gerar novo
            </Button>
            <Button variant="ghost" onClick={revoke} disabled={pending}>
              <Link2Off />
              Desativar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Envio de arquivos (prova, final, arquivo do cliente)
// -----------------------------------------------------------------------------
async function uploadArt(orderId: string, folder: ArtFolder, file: File) {
  const prep = await prepareArtUpload({
    orderId,
    folder,
    fileName: file.name,
    size: file.size,
    mime: file.type,
  });
  if (!prep.ok) throw new Error(prep.error);
  const { error } = await createClient()
    .storage.from(ART_BUCKET)
    .upload(prep.data.path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error("Falha no envio do arquivo. Tente de novo.");
  return prep.data.path;
}

export function ArtUploadButton({
  orderId,
  kind,
  versionId,
  label,
  variant = "outline",
}: {
  orderId: string;
  kind: "prova" | "final" | "cliente";
  versionId?: string;
  label: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const accept = kind === "prova" ? "image/jpeg,image/png,image/webp,application/pdf" : undefined;

  async function handle(file: File) {
    const limit = kind === "prova" ? MAX_PROOF_BYTES : MAX_ART_FILE_BYTES;
    if (file.size > limit) {
      toast.error(`Arquivo grande demais (máximo ${limit / 1024 / 1024} MB).`);
      return;
    }
    setBusy(true);
    const toastId = toast.loading(
      kind === "prova" ? "Enviando e aplicando a marca d'água…" : "Enviando…",
    );
    try {
      const folder: ArtFolder = kind === "prova" ? "provas" : kind;
      const path = await uploadArt(orderId, folder, file);
      const result =
        kind === "prova"
          ? await publishProof({ orderId, path, mime: file.type })
          : kind === "final" && versionId
            ? await attachFinalFile({ orderId, versionId, path, fileName: file.name })
            : await attachClientFile({
                orderId,
                path,
                fileName: file.name,
                size: file.size,
                mime: file.type,
              });
      if (!result.ok) throw new Error(result.error);
      toast.success(result.message, { id: toastId });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio.", { id: toastId });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
        }}
      />
      <Button variant={variant} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {label}
      </Button>
    </>
  );
}

export function DownloadButton({
  path,
  fileName,
  label = "Baixar",
}: {
  path: string;
  fileName?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 md:min-h-8"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await artDownloadUrl(path, fileName);
        setBusy(false);
        if (!r.ok) toast.error(r.error);
        else window.open(r.data.url, "_blank", "noopener");
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      {label}
    </Button>
  );
}

// -----------------------------------------------------------------------------
// Comentário na linha do tempo
// -----------------------------------------------------------------------------
export function CommentForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const id = useId();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await addOrderComment({ order_id: orderId, message });
          if (!r.ok) toast.error(r.error);
          else {
            setMessage("");
            router.refresh();
          }
        });
      }}
    >
      <Label htmlFor={id} className="sr-only">
        Comentário
      </Label>
      <Textarea
        id={id}
        value={message}
        rows={2}
        maxLength={2000}
        placeholder="Escreva um comentário para a equipe"
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button
        type="submit"
        variant="outline"
        className="self-end"
        disabled={pending || !message.trim()}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Send />}
        Comentar
      </Button>
    </form>
  );
}
