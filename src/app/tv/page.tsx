import type { Metadata } from "next";
import { Suspense } from "react";
import { TvConnect } from "./tv-connect";

export const metadata: Metadata = {
  title: "Conectar TV",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Endereço curto para abrir na TV: mostra o código para conectar (sem login). */
export default function ConectarTvPage({ searchParams }: PageProps<"/tv">) {
  return (
    // A tela da TV é sempre escura, independente do tema do aparelho.
    <div className="dark min-h-dvh bg-background text-foreground">
      <Suspense fallback={<div className="min-h-dvh bg-black" />}>
        <Conectar searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conectar({ searchParams }: { searchParams: PageProps<"/tv">["searchParams"] }) {
  const raw = await searchParams;
  return <TvConnect forceNew={raw.novo === "1"} />;
}
