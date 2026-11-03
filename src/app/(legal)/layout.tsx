import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LegalLinks } from "@/components/legal/legal-doc";

/** Textos legais: públicos (sem login), estáticos e legíveis no celular. */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3">
          {/* Sem aria-label: o nome acessível começa pelo texto visível do logo (WCAG 2.5.3). */}
          <Link href="/login" className="min-h-11 content-center">
            <Logo />
            <span className="sr-only">, ir para o login</span>
          </Link>
          <Link
            href="/inicio"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
          >
            Voltar ao sistema
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:py-12">{children}</main>
      <footer className="border-t">
        <LegalLinks className="mx-auto max-w-3xl px-4 py-4 text-sm text-muted-foreground" />
      </footer>
    </div>
  );
}
