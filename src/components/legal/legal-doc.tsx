import Link from "next/link";
import { formatDate } from "@/lib/format";
import { LEGAL } from "@/lib/legal";

/** Links para os textos legais (login, rodapés e menu do usuário). */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Documentos legais" className={className}>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <li>
          <Link
            href="/privacidade"
            className="inline-flex min-h-11 items-center hover:underline md:min-h-0"
          >
            Política de Privacidade
          </Link>
        </li>
        <li>
          <Link
            href="/termos"
            className="inline-flex min-h-11 items-center hover:underline md:min-h-0"
          >
            Termos de Uso
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** Valor do operador ou um destaque "a definir" enquanto não for preenchido em `src/lib/legal.ts`. */
export function Fill({ value, label }: { value: string | null; label: string }) {
  if (value) return <>{value}</>;
  return <mark className="rounded bg-warning-soft px-1 text-warning">[{label} a definir]</mark>;
}

export function ContactEmail() {
  return LEGAL.privacyEmail ? (
    <a href={`mailto:${LEGAL.privacyEmail}`} className="font-medium underline">
      {LEGAL.privacyEmail}
    </a>
  ) : (
    <Fill value={null} label="e-mail de privacidade" />
  );
}

export type LegalSection = { id: string; title: string; body: React.ReactNode };

/** Documento com título, data de atualização, sumário e seções numeradas. */
export function LegalDoc({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Versão {LEGAL.version} · atualizada em {formatDate(`${LEGAL.updatedAt}T12:00:00-03:00`)}
        </p>
        <div className="text-base leading-relaxed">{intro}</div>
      </header>

      <nav aria-labelledby="sumario" className="rounded-2xl border bg-card p-5">
        <h2 id="sumario" className="mb-3 text-sm font-semibold">
          Sumário
        </h2>
        <ol className="grid gap-1 text-sm sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-11 items-center hover:underline md:min-h-8"
              >
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((s, i) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-titulo`} className="scroll-mt-6">
          <h2 id={`${s.id}-titulo`} className="mb-3 font-heading text-xl font-semibold">
            {i + 1}. {s.title}
          </h2>
          <div className="flex flex-col gap-3 leading-relaxed text-foreground/90 [&_li]:mt-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
            {s.body}
          </div>
        </section>
      ))}
    </article>
  );
}
