import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { stockDialogOptions } from "./data";
import { ConsumeDialog, MovementDialog } from "./stock-dialogs";
import { StockNav } from "./stock-nav";

export default function EstoqueLayout({ children }: LayoutProps<"/estoque">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Estoque"
        description="Saldos de insumos e peças prontas, custo médio e quanto dá para produzir."
        actions={
          <Suspense fallback={null}>
            <Actions />
          </Suspense>
        }
      />
      <StockNav />
      {children}
    </div>
  );
}

async function Actions() {
  const { membership } = await requireOrg("estoque.ver");
  const canMove = can(membership.permissions, "estoque.gerenciar");
  const canConsume = can(membership.permissions, ["estoque.gerenciar", "pedidos.gerenciar"]);
  if (!canMove && !canConsume) return null;
  const { items, consumable } = await stockDialogOptions(membership.organizationId);
  return (
    <>
      {canConsume && <ConsumeDialog variants={consumable} />}
      {canMove && <MovementDialog items={items} />}
    </>
  );
}
