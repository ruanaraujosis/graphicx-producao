import { CheckCircle2, CircleDashed, PauseCircle } from "lucide-react";

/** Andamento do produto — visível só para o SuperAdmin, na Plataforma. */
const ROADMAP = [
  {
    phase: 1,
    title: "Fundação",
    detail: "Multi-empresa, perfis configuráveis, MFA, marca GraphicX, tema claro/escuro",
  },
  {
    phase: 2,
    title: "Cadastros + Estoque",
    detail: "Produtos, variações, insumos e ficha técnica",
  },
  { phase: 3, title: "Pedidos + PCP + Artes", detail: "Kanban em tempo real e aprovação de artes" },
  { phase: 4, title: "TV + Financeiro", detail: "Painel para TV e financeiro básico" },
  { phase: 5, title: "Shopee", detail: "Produtos, estoque, pedidos, etiquetas e rastreio" },
  {
    phase: 6,
    title: "NF-e automática",
    detail: "Emissão e reforma tributária (IBS/CBS) — adiada até as vendas pelo sistema",
    postponed: true,
  },
  {
    phase: 7,
    title: "Marketing Shopee",
    detail: "Impulsionamento e respostas às avaliações; venda rápida e Início como dashboard",
  },
];

/** Última fase concluída (as adiadas não contam). */
const CURRENT_PHASE = 7;

export function Roadmap() {
  return (
    <section aria-labelledby="roadmap" className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 id="roadmap" className="font-heading text-base font-semibold">
        Andamento do projeto
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Visível só para você, na Plataforma.</p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {ROADMAP.map((step) => {
          const postponed = "postponed" in step && step.postponed;
          const done = !postponed && step.phase <= CURRENT_PHASE;
          return (
            <li key={step.phase} className="flex items-start gap-3 rounded-xl p-2">
              {done ? (
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-success"
                  aria-label="Concluída"
                />
              ) : postponed ? (
                <PauseCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-label="Adiada" />
              ) : (
                <CircleDashed
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                  aria-label="Pendente"
                />
              )}
              <div>
                <p className="text-sm font-medium">
                  Fase {step.phase} · {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
