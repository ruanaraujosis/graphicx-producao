import { PageHeader } from "@/components/kit/page-header";
import { FinanceNav } from "./finance-nav";

export default function FinanceiroLayout({ children }: LayoutProps<"/financeiro">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financeiro"
        description="Contas a receber e a pagar, fluxo de caixa, DRE e margem por produto."
      />
      <FinanceNav />
      {children}
    </div>
  );
}
