"use client";

import { CheckCircle2, ExternalLink, Loader2, PenLine, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ART_BUCKET, MAX_ART_FILE_BYTES, formatBytes } from "@/lib/art/files";
import { createClient } from "@/lib/supabase/client";
import { confirmClientUpload, prepareClientUpload, submitReview } from "./actions";

type Pin = { x: number; y: number; n: number };

export function ProofReview({
  token,
  versionId,
  proofUrl,
  isPdf,
  defaultName,
}: {
  token: string;
  versionId: string;
  proofUrl: string | null;
  isPdf: boolean;
  defaultName: string;
}) {
  const router = useRouter();
  const ids = useId();
  const [pins, setPins] = useState<Pin[]>([]);
  const [comment, setComment] = useState("");
  const [name, setName] = useState(defaultName);
  const [mode, setMode] = useState<"view" | "change">("view");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const commentRef = useRef<HTMLTextAreaElement>(null);

  function addPin(e: React.MouseEvent<HTMLButtonElement>) {
    if (pins.length >= 30) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const n = pins.length + 1;
    setPins((p) => [...p, { x: round(x), y: round(y), n }]);
    setMode("change");
    setComment((c) => (c ? `${c}\n${n}. ` : `${n}. `));
    // Leva o cursor para o fim do comentário, no item do ponto marcado.
    requestAnimationFrame(() => {
      const el = commentRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function send(decision: "aprovada" | "alteracao") {
    startTransition(async () => {
      const r = await submitReview(token, {
        versionId,
        decision,
        comment: comment.trim() || undefined,
        name: name.trim() || undefined,
        pins: decision === "alteracao" ? pins : [],
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setConfirmOpen(false);
      toast.success(r.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {proofUrl && !isPdf ? (
        <div className="overflow-hidden rounded-2xl border bg-muted">
          <button
            type="button"
            onClick={addPin}
            className="relative block w-full cursor-crosshair"
            aria-label="Marcar um ponto na prova"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária */}
            <img
              src={proofUrl}
              alt="Prova da arte"
              className="block w-full select-none"
              draggable={false}
            />
            {pins.map((p) => (
              <span
                key={p.n}
                aria-hidden
                className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-destructive text-xs font-bold text-white shadow"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                {p.n}
              </span>
            ))}
          </button>
        </div>
      ) : proofUrl && isPdf ? (
        <div className="flex flex-col gap-2">
          <object
            data={proofUrl}
            type="application/pdf"
            className="hidden aspect-[3/4] w-full rounded-2xl border md:block"
            aria-label="Prova em PDF"
          />
          <Button variant="outline" asChild>
            <a href={proofUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              Abrir a prova (PDF)
            </a>
          </Button>
        </div>
      ) : (
        <p className="rounded-xl bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
          Não foi possível carregar a prova. Atualize a página.
        </p>
      )}

      {pins.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{pins.length} ponto(s) marcado(s)</span>
          <Button variant="ghost" size="sm" onClick={() => setPins([])}>
            <X />
            Limpar pontos
          </Button>
        </div>
      )}

      {mode === "change" ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <Label htmlFor={`${ids}-c`}>O que precisa mudar?</Label>
          <Textarea
            ref={commentRef}
            id={`${ids}-c`}
            rows={4}
            maxLength={2000}
            value={comment}
            placeholder="Ex.: 1. trocar o telefone para (11) 9…; 2. aumentar o logo"
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="destructive"
              disabled={pending || comment.trim().length < 3}
              onClick={() => send("alteracao")}
            >
              {pending ? <Loader2 className="animate-spin" /> : <PenLine />}
              Enviar pedido de alteração
            </Button>
            <Button variant="ghost" onClick={() => setMode("view")}>
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" size="lg" onClick={() => setConfirmOpen(true)}>
            <CheckCircle2 />
            Aprovar arte
          </Button>
          <Button className="flex-1" size="lg" variant="outline" onClick={() => setMode("change")}>
            <PenLine />
            Pedir alteração
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar a arte?</DialogTitle>
            <DialogDescription>
              A arte vai para a produção exatamente como está na prova. Confira textos, telefones e
              cores antes de confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-n`}>Seu nome</Label>
            <Input
              id={`${ids}-n`}
              value={name}
              maxLength={120}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Registramos data, hora e a versão aprovada como comprovante.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Voltar
            </Button>
            <Button disabled={pending || name.trim().length < 2} onClick={() => send("aprovada")}>
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Confirmar aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function round(n: number) {
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}

export function ClientUploader({ token }: { token: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const noteId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  function pick(list: FileList | null) {
    if (!list) return;
    const chosen = [...list];
    const big = chosen.filter((f) => f.size > MAX_ART_FILE_BYTES);
    if (big.length) toast.error(`${big[0].name}: passa de 50 MB.`);
    setFiles((current) =>
      [...current, ...chosen.filter((f) => f.size <= MAX_ART_FILE_BYTES)].slice(0, 10),
    );
    if (input.current) input.current.value = "";
  }

  async function send() {
    setBusy(true);
    const supabase = createClient();
    let sent = 0;
    try {
      for (const [i, file] of files.entries()) {
        setProgress(`Enviando ${i + 1} de ${files.length}…`);
        const meta = {
          fileName: file.name,
          size: file.size,
          mime: file.type || "application/octet-stream",
        };
        const prep = await prepareClientUpload(token, meta);
        if (!prep.ok) throw new Error(prep.error);
        const { error } = await supabase.storage
          .from(ART_BUCKET)
          .uploadToSignedUrl(prep.data.path, prep.data.uploadToken, file, {
            contentType: file.type || undefined,
          });
        if (error) throw new Error(`Falha ao enviar ${file.name}. Tente de novo.`);
        const done = await confirmClientUpload(token, {
          ...meta,
          path: prep.data.path,
          note: i === 0 ? note : undefined,
        });
        if (!done.ok) throw new Error(done.error);
        sent++;
      }
      toast.success(sent === 1 ? "Arquivo enviado!" : `${sent} arquivos enviados!`);
      setFiles([]);
      setNote("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio.");
      setFiles((f) => f.slice(sent));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files)}
      />
      <Button variant="outline" size="lg" disabled={busy} onClick={() => input.current?.click()}>
        <Upload />
        Escolher arquivos
      </Button>
      {files.length > 0 && (
        <>
          <ul className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Tirar ${f.name}`}
                  disabled={busy}
                  onClick={() => setFiles((list) => list.filter((_, idx) => idx !== i))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <Label htmlFor={noteId}>Recado para a gráfica (opcional)</Label>
            <Textarea
              id={noteId}
              rows={2}
              maxLength={1000}
              value={note}
              placeholder="Ex.: usar o logo azul, fundo branco"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button size="lg" disabled={busy} onClick={send}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? progress : `Enviar ${files.length} arquivo(s)`}
          </Button>
        </>
      )}
    </div>
  );
}
