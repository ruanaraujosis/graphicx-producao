"use client";

import { Cast, Loader2, MonitorSmartphone, Square, Tv } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { connectTvByCode } from "@/app/(app)/configuracoes/tv/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { castToTv, listCastTargets } from "@/lib/tv/cast-actions";
import { screenForPath, TV_SCREENS, type TvScreen } from "@/lib/tv/screens";

type Target = Awaited<ReturnType<typeof listCastTargets>>[number];

/**
 * Botão "Reproduzir na TV" (como o do YouTube): escolhe uma TV conectada e
 * manda a tela que está aberta. Também conecta uma TV nova com o código dela.
 */
export function CastToTv({ canConnect }: { canConnect: boolean }) {
  const pathname = usePathname();
  const screen = screenForPath(pathname);
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [connecting, startConnect] = useTransition();

  async function load() {
    const list = await listCastTargets();
    setTargets(list);
  }

  async function play(target: Target, next: TvScreen | null) {
    setBusy(target.id);
    const r = await castToTv(target.id, next);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message);
      await load();
    } else toast.error(r.error);
  }

  const connect = () =>
    startConnect(async () => {
      const r = await connectTvByCode({ code, device_id: null, name: "TV da produção" });
      if (r.ok) {
        toast.success(r.message);
        setCode("");
        await load();
      } else toast.error(r.error);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void load();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reproduzir na TV"
              className="size-11 rounded-full text-brand-header-foreground hover:bg-white/10 hover:text-brand-header-foreground"
            >
              <Cast className="size-5" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Reproduzir na TV</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reproduzir na TV</DialogTitle>
          <DialogDescription>
            {screen
              ? `Esta tela vai para a TV: ${TV_SCREENS[screen]}.`
              : "A TV mostra o painel completo, girando entre as telas."}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2">
          {targets === null && (
            <li className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Procurando TVs…
            </li>
          )}
          {targets?.length === 0 && (
            <li className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhuma TV conectada ainda. Use o código da TV abaixo.
            </li>
          )}
          {targets?.map((t) => {
            const playing = t.castScreen !== null;
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-xl border p-3">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    playing
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Tv className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {playing
                      ? `Reproduzindo: ${TV_SCREENS[t.castScreen!]}`
                      : t.online
                        ? "Ligada agora"
                        : "Fora do ar (abra o painel na TV)"}
                  </p>
                </div>
                {playing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Parar de reproduzir em ${t.name}`}
                    disabled={busy === t.id}
                    onClick={() => play(t, null)}
                  >
                    <Square />
                  </Button>
                )}
                <Button
                  size="sm"
                  className="min-h-11 md:min-h-9"
                  disabled={busy === t.id}
                  onClick={() => play(t, screen)}
                >
                  {busy === t.id ? <Loader2 className="animate-spin" /> : <Cast />}
                  {screen ? "Reproduzir" : "Painel"}
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <MonitorSmartphone className="size-4" aria-hidden />
            Vincular com código de TV
          </p>
          {canConnect ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                connect();
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Código da TV"
                aria-label="Código que aparece na TV"
                autoComplete="off"
                maxLength={8}
                className="min-h-11 font-mono tracking-widest"
              />
              <Button type="submit" className="min-h-11" disabled={connecting || !code.trim()}>
                {connecting ? <Loader2 className="animate-spin" /> : "Vincular"}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">
              Peça a quem administra a gráfica para vincular uma TV.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Na TV, abra o navegador no endereço do GraphicX com{" "}
            <span className="font-mono">/tv</span> no fim: ela mostra o código.
            {canConnect && (
              <>
                {" "}
                <Link href="/configuracoes/tv" className="underline" onClick={() => setOpen(false)}>
                  Gerenciar TVs
                </Link>
              </>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
