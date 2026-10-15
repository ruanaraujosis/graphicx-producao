"use client";

import { Loader2, Tv } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useEffectEvent, useState } from "react";

const SAVED = "gx_tv_url";
const POLL_MS = 3000;

type Pairing = { code: string; secret: string; expiresAt: string };

function readSaved() {
  try {
    return localStorage.getItem(SAVED);
  } catch {
    return null;
  }
}

function save(url: string) {
  try {
    localStorage.setItem(SAVED, url);
  } catch {
    // Sem armazenamento (modo anônimo): só não lembra na próxima vez.
  }
}

/**
 * Tela da TV para conectar com código (como no YouTube): mostra o código e um
 * QR; quando alguém conecta pelo GraphicX, abre o painel sozinha. Lembra a
 * última TV conectada neste aparelho.
 */
export function TvConnect({ forceNew }: { forceNew: boolean }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Cada volta pede um código novo (início, código vencido ou falha de rede).
  const [round, setRound] = useState(0);
  const nextRound = () => setRound((r) => r + 1);

  const requestCode = useEffectEvent(async () => {
    const res = await fetch("/api/tv/pareamento", { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as (Pairing & { error?: string }) | null;
    if (!res?.ok || !body?.code) {
      setError(body?.error ?? "Sem conexão. Tentando de novo…");
      setTimeout(nextRound, 10_000);
      return;
    }
    setError(null);
    setPairing(body);
    const link = `${window.location.origin}/configuracoes/tv?codigo=${body.code}`;
    setQr(await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
  });

  const poll = useEffectEvent(async (p: Pairing) => {
    const res = await fetch("/api/tv/pareamento", {
      headers: { "x-tv-secret": p.secret },
      cache: "no-store",
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { status?: string; url?: string } | null;
    if (body?.status === "conectada" && body.url) {
      save(body.url);
      window.location.replace(body.url);
    } else if (body?.status === "expirada") {
      nextRound();
    }
  });

  useEffect(() => {
    // Na primeira volta, uma TV já conectada neste aparelho vai direto ao painel.
    const saved = forceNew || round > 0 ? null : readSaved();
    if (saved?.startsWith("/tv/")) {
      window.location.replace(saved);
      return;
    }
    const timer = setTimeout(() => void requestCode(), 0);
    return () => clearTimeout(timer);
  }, [forceNew, round]);

  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(() => void poll(pairing), POLL_MS);
    return () => clearInterval(timer);
  }, [pairing]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 p-8 text-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Tv className="size-8" aria-hidden />
        <p className="text-2xl">Conectar esta TV ao GraphicX</p>
      </div>
      {pairing ? (
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:gap-16">
          <div className="flex flex-col items-center gap-4">
            <p className="text-xl text-muted-foreground">Código da TV</p>
            <p className="font-mono text-7xl font-bold tracking-[0.3em] lg:text-8xl">
              {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
            </p>
            <p className="max-w-xl text-lg text-muted-foreground">
              No GraphicX, abra <strong>Configurações → Dispositivos de TV → Conectar TV</strong> e
              digite o código.
            </p>
          </div>
          {qr && (
            <div className="flex flex-col items-center gap-3">
              <div
                className="size-56 rounded-2xl bg-white p-3 [&>svg]:size-full"
                role="img"
                aria-label="QR Code para conectar pelo celular"
                // SVG gerado pela biblioteca de QR Code (sem conteúdo do usuário).
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <p className="text-lg text-muted-foreground">Ou aponte a câmera do celular</p>
            </div>
          )}
        </div>
      ) : (
        <Loader2
          className="size-12 animate-spin text-muted-foreground"
          aria-label="Gerando código"
        />
      )}
      {error && <p className="text-lg text-warning">{error}</p>}
      <p className="text-base text-muted-foreground">
        O código vale 10 minutos e é trocado sozinho. Esta TV fica lembrada.
      </p>
    </main>
  );
}
