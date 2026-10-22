"use client";

import {
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Tags,
  Target,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { EntityFormDialog, type FieldOption } from "@/components/kit/entity-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  cancelPayable,
  cancelReceivable,
  reopenPayable,
  reopenReceivable,
  saveCategory,
  saveGoal,
  savePayable,
  saveReceivable,
  setCategoryActive,
  settlePayable,
  settleReceivable,
} from "./actions";
import {
  categorySchema,
  goalSchema,
  payableSchema,
  receivableSchema,
  settleSchema,
} from "./schema";

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? ""
    : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Result = { ok: true; message: string } | { ok: false; error: string };

/** Executa uma ação simples (reabrir, cancelar) com aviso e atualização da tela. */
function useQuickAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<Result>) =>
      start(async () => {
        const r = await fn();
        if (r.ok) {
          toast.success(r.message);
          router.refresh();
        } else toast.error(r.error);
      }),
  };
}

// -----------------------------------------------------------------------------
// Contas a receber
// -----------------------------------------------------------------------------
export type ReceivableRow = {
  id: string;
  order_id: string | null;
  description: string;
  customer_name: string | null;
  gross: number;
  fee: number;
  due_date: string;
  status: "aberto" | "recebido" | "cancelado";
  notes: string | null;
};

export function NewReceivableButton({ today }: { today: string }) {
  return (
    <EntityFormDialog
      title="Nova conta a receber"
      description="Para recebimentos que não vêm de pedido (ex.: serviço avulso). As de pedido entram sozinhas."
      trigger={
        <Button>
          <Plus />
          Nova conta
        </Button>
      }
      schema={receivableSchema}
      defaultValues={{
        description: "",
        customer_name: "",
        gross: "",
        fee: "0,00",
        due_date: today,
        notes: "",
      }}
      fields={[
        { name: "description", label: "Descrição", placeholder: "Ex.: criação de logotipo" },
        { name: "customer_name", label: "Cliente (opcional)" },
        { name: "gross", label: "Valor (R$)", type: "number", half: true },
        { name: "fee", label: "Taxa (R$)", type: "number", half: true },
        { name: "due_date", label: "Vencimento", type: "date", half: true },
        { name: "notes", label: "Observação", type: "textarea" },
      ]}
      action={(values) => saveReceivable(values)}
      submitLabel="Lançar"
    />
  );
}

export function ReceivableActions({ row, today }: { row: ReceivableRow; today: string }) {
  const [dialog, setDialog] = useState<"edit" | "settle" | null>(null);
  const { pending, run } = useQuickAction();
  const fromOrder = Boolean(row.order_id);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Ações de ${row.description}`}
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.status === "aberto" && (
            <DropdownMenuItem className="min-h-11 md:min-h-8" onSelect={() => setDialog("settle")}>
              <CheckCircle2 />
              Registrar recebimento
            </DropdownMenuItem>
          )}
          {row.status !== "cancelado" && (
            <DropdownMenuItem className="min-h-11 md:min-h-8" onSelect={() => setDialog("edit")}>
              <Pencil />
              {fromOrder ? "Editar taxa e vencimento" : "Editar"}
            </DropdownMenuItem>
          )}
          {row.status !== "aberto" && (
            <DropdownMenuItem
              className="min-h-11 md:min-h-8"
              onSelect={() => run(() => reopenReceivable(row.id))}
            >
              <RotateCcw />
              Reabrir
            </DropdownMenuItem>
          )}
          {!fromOrder && row.status === "aberto" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="min-h-11 md:min-h-8"
                onSelect={() => run(() => cancelReceivable(row.id))}
              >
                <XCircle />
                Cancelar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EntityFormDialog
        open={dialog === "settle"}
        onOpenChange={(o) => setDialog(o ? "settle" : null)}
        title="Registrar recebimento"
        description={`${row.description} · líquido ${money(row.gross - row.fee)}`}
        schema={settleSchema}
        defaultValues={{ date: today }}
        fields={[{ name: "date", label: "Data do recebimento", type: "date" }]}
        action={(values) => settleReceivable(row.id, values)}
        submitLabel="Registrar"
      />
      <EntityFormDialog
        open={dialog === "edit"}
        onOpenChange={(o) => setDialog(o ? "edit" : null)}
        title={fromOrder ? "Taxa e vencimento" : "Editar conta a receber"}
        description={
          fromOrder
            ? "O valor acompanha o pedido. Ajuste aqui a taxa real e o vencimento."
            : undefined
        }
        schema={receivableSchema}
        defaultValues={{
          description: row.description,
          customer_name: row.customer_name ?? "",
          gross: money(row.gross),
          fee: money(row.fee),
          due_date: row.due_date,
          notes: row.notes ?? "",
        }}
        fields={[
          ...(fromOrder
            ? []
            : [
                { name: "description", label: "Descrição" },
                { name: "customer_name", label: "Cliente (opcional)" },
                { name: "gross", label: "Valor (R$)", type: "number" as const, half: true },
              ]),
          { name: "fee", label: "Taxa (R$)", type: "number", half: true },
          { name: "due_date", label: "Vencimento", type: "date", half: true },
          { name: "notes", label: "Observação", type: "textarea" },
        ]}
        action={(values) => saveReceivable(values, row.id)}
      />
    </>
  );
}

// -----------------------------------------------------------------------------
// Contas a pagar
// -----------------------------------------------------------------------------
export type PayableRow = {
  id: string;
  description: string;
  supplier_id: string | null;
  category_id: string | null;
  amount: number;
  due_date: string;
  recurrence: "nenhuma" | "mensal";
  status: "aberto" | "pago" | "cancelado";
  notes: string | null;
};

function payableFields(suppliers: readonly FieldOption[], categories: readonly FieldOption[]) {
  return [
    { name: "description", label: "Descrição", placeholder: "Ex.: aluguel do galpão" },
    {
      name: "category_id",
      label: "Categoria",
      type: "select" as const,
      half: true,
      options: [{ value: "__none", label: "Sem categoria" }, ...categories],
    },
    {
      name: "supplier_id",
      label: "Fornecedor",
      type: "select" as const,
      half: true,
      options: [{ value: "__none", label: "Nenhum" }, ...suppliers],
    },
    { name: "amount", label: "Valor (R$)", type: "number" as const, half: true },
    { name: "due_date", label: "Vencimento", type: "date" as const, half: true },
    {
      name: "recurrence",
      label: "Repetir",
      type: "select" as const,
      options: [
        { value: "nenhuma", label: "Não repetir" },
        { value: "mensal", label: "Todo mês (lança o próximo ao pagar)" },
      ],
    },
    { name: "notes", label: "Observação", type: "textarea" as const },
  ];
}

export function NewPayableButton({
  today,
  suppliers,
  categories,
}: {
  today: string;
  suppliers: readonly FieldOption[];
  categories: readonly FieldOption[];
}) {
  return (
    <EntityFormDialog
      title="Nova conta a pagar"
      trigger={
        <Button>
          <Plus />
          Nova conta
        </Button>
      }
      schema={payableSchema}
      defaultValues={{
        description: "",
        category_id: "__none",
        supplier_id: "__none",
        amount: "",
        due_date: today,
        recurrence: "nenhuma",
        notes: "",
      }}
      fields={payableFields(suppliers, categories)}
      action={(values) => savePayable(values)}
      submitLabel="Lançar"
    />
  );
}

export function PayableActions({
  row,
  today,
  suppliers,
  categories,
}: {
  row: PayableRow;
  today: string;
  suppliers: readonly FieldOption[];
  categories: readonly FieldOption[];
}) {
  const [dialog, setDialog] = useState<"edit" | "settle" | null>(null);
  const { pending, run } = useQuickAction();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Ações de ${row.description}`}
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.status === "aberto" && (
            <DropdownMenuItem className="min-h-11 md:min-h-8" onSelect={() => setDialog("settle")}>
              <CheckCircle2 />
              Registrar pagamento
            </DropdownMenuItem>
          )}
          {row.status !== "cancelado" && (
            <DropdownMenuItem className="min-h-11 md:min-h-8" onSelect={() => setDialog("edit")}>
              <Pencil />
              Editar
            </DropdownMenuItem>
          )}
          {row.status !== "aberto" && (
            <DropdownMenuItem
              className="min-h-11 md:min-h-8"
              onSelect={() => run(() => reopenPayable(row.id))}
            >
              <RotateCcw />
              Reabrir
            </DropdownMenuItem>
          )}
          {row.status === "aberto" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="min-h-11 md:min-h-8"
                onSelect={() => run(() => cancelPayable(row.id))}
              >
                <XCircle />
                Cancelar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EntityFormDialog
        open={dialog === "settle"}
        onOpenChange={(o) => setDialog(o ? "settle" : null)}
        title="Registrar pagamento"
        description={`${row.description} · ${money(row.amount)}`}
        schema={settleSchema}
        defaultValues={{ date: today }}
        fields={[{ name: "date", label: "Data do pagamento", type: "date" }]}
        action={(values) => settlePayable(row.id, values)}
        submitLabel="Registrar"
      />
      <EntityFormDialog
        open={dialog === "edit"}
        onOpenChange={(o) => setDialog(o ? "edit" : null)}
        title="Editar conta a pagar"
        schema={payableSchema}
        defaultValues={{
          description: row.description,
          category_id: row.category_id ?? "__none",
          supplier_id: row.supplier_id ?? "__none",
          amount: money(row.amount),
          due_date: row.due_date,
          recurrence: row.recurrence,
          notes: row.notes ?? "",
        }}
        fields={payableFields(suppliers, categories)}
        action={(values) => savePayable(values, row.id)}
      />
    </>
  );
}

// -----------------------------------------------------------------------------
// Categorias de despesa
// -----------------------------------------------------------------------------
export function CategoriesDialog({
  categories,
}: {
  categories: readonly { id: string; name: string; active: boolean }[];
}) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const { run } = useQuickAction();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Tags />
          Categorias
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorias de despesa</DialogTitle>
          <DialogDescription>Desativar esconde a categoria nas contas novas.</DialogDescription>
        </DialogHeader>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = categorySchema.safeParse({ name });
            if (!parsed.success) {
              toast.error(parsed.error.issues[0]?.message ?? "Nome inválido.");
              return;
            }
            start(async () => {
              const r = await saveCategory({ name });
              if (r.ok) {
                toast.success(r.message);
                setName("");
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor={id}>Nova categoria</Label>
            <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
            Criar
          </Button>
        </form>
        <ul className="divide-y rounded-xl border">
          {categories.map((c) => (
            <li key={c.id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
              <span className={c.active ? "text-sm" : "text-sm text-muted-foreground line-through"}>
                {c.name}
              </span>
              <Switch
                checked={c.active}
                aria-label={c.active ? `Desativar ${c.name}` : `Reativar ${c.name}`}
                onCheckedChange={(on) => run(() => setCategoryActive(c.id, on))}
              />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Meta do mês
// -----------------------------------------------------------------------------
export function GoalDialog({ monthlyGoal }: { monthlyGoal: number | null }) {
  return (
    <EntityFormDialog
      title="Meta de faturamento do mês"
      description="A meta do dia e da semana são calculadas pelos dias úteis. Deixe vazio para não usar meta."
      trigger={
        <Button variant="outline">
          <Target />
          {monthlyGoal ? "Alterar meta" : "Definir meta"}
        </Button>
      }
      schema={goalSchema}
      defaultValues={{ monthly_goal: monthlyGoal ? money(monthlyGoal) : "" }}
      fields={[{ name: "monthly_goal", label: "Meta do mês (R$)", type: "number" }]}
      action={(values) => saveGoal(values)}
    />
  );
}
