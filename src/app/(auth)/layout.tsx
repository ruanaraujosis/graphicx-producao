import { LogoMark } from "@/components/brand/logo";

/** Telas de passagem do login (MFA, escolha de gráfica, senha): cartão centralizado. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <LogoMark className="mx-auto mb-6 h-12" />
        {children}
      </div>
    </main>
  );
}
