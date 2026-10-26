import { Suspense } from "react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Painel da marca (desktop) */}
      {/* Cores fixas (não seguem o tema): o painel é sempre o azul-marinho da marca. */}
      <div className="relative hidden overflow-hidden bg-linear-to-br from-[#14287a] via-[#123a7f] to-[#0e7c86] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo inverse className="relative z-10 text-white" />
        <div className="relative z-10 max-w-md">
          <p className="font-heading text-4xl leading-tight font-bold">
            A gestão completa da sua <span className="text-[#7cc4fa]">gráfica</span>.
          </p>
          <p className="mt-4 text-white/80">
            Pedidos de todos os canais, aprovação de artes, produção, estoque e expedição em um só
            lugar.
          </p>
        </div>
        <p className="relative z-10 text-sm text-white/80">GraphicX · plataforma para gráficas</p>
        {/* Onda azul-céu, como no site de referência */}
        <svg
          aria-hidden
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full"
        >
          <path d="M0 120 C150 40 300 200 600 90 L600 200 L0 200 Z" fill="#42a5f5" opacity="0.35" />
          <path d="M0 160 C200 90 380 210 600 140 L600 200 L0 200 Z" fill="#42a5f5" opacity="0.5" />
        </svg>
      </div>

      {/* Formulário */}
      <main className="flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <LogoMark className="h-14 lg:hidden" />
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight">Entrar no sistema</h1>
              <p className="mt-1 text-sm text-muted-foreground">Entre com seu e-mail ou usuário.</p>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <Suspense fallback={<div className="h-64" aria-hidden />}>
              <LoginForm />
            </Suspense>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Entra só com usuário? Peça ao admin da sua gráfica para redefinir a senha.
          </p>
        </div>
      </main>
    </div>
  );
}
