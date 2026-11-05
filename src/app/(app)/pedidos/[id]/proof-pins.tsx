"use client";

import { Maximize2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { notesByPin, type ProofPin } from "@/lib/art/pins";

/**
 * Prova com os pontos marcados pelo cliente por cima. O contêiner tem exatamente o tamanho da
 * imagem (sem faixas vazias), então as posições relativas caem no mesmo lugar em qualquer tela.
 * A arte não é alterada: os pontos são uma camada.
 */
function PinnedImage({
  src,
  alt,
  pins,
  size,
  className,
}: {
  src: string;
  alt: string;
  pins: ProofPin[];
  size: "sm" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("relative inline-block max-w-full align-top", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária */}
      <img
        src={src}
        alt={alt}
        className={cn(
          "block h-auto w-auto max-w-full select-none",
          size === "sm" ? "max-h-56" : "max-h-[70dvh]",
        )}
        draggable={false}
      />
      {pins.map((p) => (
        <span
          key={p.n}
          aria-hidden
          className={cn(
            "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-destructive font-bold text-destructive-foreground shadow",
            size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs",
          )}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
        >
          {p.n}
        </span>
      ))}
    </div>
  );
}

export function ProofPins({
  src,
  version,
  pins,
  comment,
  reviewer,
}: {
  src: string;
  version: number;
  /** Pontos do último pedido de alteração desta versão (vazio se não houver). */
  pins: ProofPin[];
  comment: string | null;
  reviewer: string | null;
}) {
  const alt = `Prova v${version}`;
  const thumb = (
    <div className="flex justify-center rounded-lg border bg-muted p-1">
      <PinnedImage src={src} alt={alt} pins={pins} size="sm" />
    </div>
  );
  if (pins.length === 0) return thumb;

  const { notes, general } = notesByPin(comment);
  return (
    <Dialog>
      {thumb}
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 self-start md:min-h-8">
          <Maximize2 />
          Ver {pins.length} ponto(s) marcado(s)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Pontos marcados na prova v{version}</DialogTitle>
          <DialogDescription>
            Marcados por {reviewer ?? "cliente"}. A arte original não foi alterada.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center rounded-lg bg-muted p-2">
          <PinnedImage
            src={src}
            alt={`${alt}, com ${pins.length} ponto(s)`}
            pins={pins}
            size="lg"
          />
        </div>
        <ol className="flex flex-col gap-2 text-sm">
          {pins.map((p) => (
            <li key={p.n} className="flex items-start gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
                {p.n}
              </span>
              <span className="pt-0.5">
                {notes.get(p.n) || <span className="text-muted-foreground">Sem comentário.</span>}
              </span>
            </li>
          ))}
        </ol>
        {general && <p className="text-sm text-muted-foreground">Observação: {general}</p>}
      </DialogContent>
    </Dialog>
  );
}
