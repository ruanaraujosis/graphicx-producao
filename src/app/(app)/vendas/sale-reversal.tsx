"use client";

import { Ban, Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseDecimal } from "@/lib/form-schemas";
import { cancelSale, returnSale } from "./reversal-actions";

export type ReturnableItem = {
  id: string;
  description: string;
  quantity: number;
  returned: number;
};

/** Cancelar ou devolver uma venda concluída (pedidos.cancelar + senha de quem faz). */
export function SaleReversal({ orderId, items }: { orderId: string; items: ReturnableItem[] }) {
  const open = items.filter((i) => i.quantity - i.returned > 0);
  return (
    <>
      {open.length > 0 && <ReturnDialog orderId={orderId} items={open} />}
      <CancelDialog orderId={orderId} />
    </>
  );
}

function useReversal() {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();
  const reset = () => {
    setReason("");
    setPassword("");
    // Chave nova a cada abertura: repetir o clique não duplica a operação.
    setKey(crypto.randomUUID());
  };
  return { router, reason, setReason, password, setPassword, key, pending, start, reset };
}

function ReasonAndPassword({
  prefix,
  reason,
  setReason,
  password,
  setPassword,
}: {
  prefix: string;
  reason: string;
  setReason: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-reason`}>Motivo</Label>
        <Textarea
          id={`${prefix}-reason`}
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-password`}>Sua senha (confirmação)</Label>
        <Input
          id={`${prefix}-password`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-11"
        />
      </div>
    </>
  );
}

function CancelDialog({ orderId }: { orderId: string }) {
  const [openDialog, setOpenDialog] = useState(false);
  const r = useReversal();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    r.start(async () => {
      const res = await cancelSale({ orderId, reason: r.reason, password: r.password, key: r.key });
      if (res.ok) {
        toast.success(res.message);
        setOpenDialog(false);
        r.router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    <Dialog
      open={openDialog}
      onOpenChange={(o) => {
        if (o) r.reset();
        setOpenDialog(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          <Ban />
          Cancelar venda
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Cancelar venda</DialogTitle>
            <DialogDescription>
              Os produtos prontos voltam ao estoque. O a receber em aberto é cancelado; se a venda
              já foi paga, entra uma conta a pagar de estorno. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <ReasonAndPassword
            prefix="cancel"
            reason={r.reason}
            setReason={r.setReason}
            password={r.password}
            setPassword={r.setPassword}
          />
          <DialogFooter>
            <Button type="submit" variant="destructive" className="min-h-11" disabled={r.pending}>
              {r.pending ? <Loader2 className="animate-spin" /> : <Ban />}
              Cancelar venda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ orderId, items }: { orderId: string; items: ReturnableItem[] }) {
  const [openDialog, setOpenDialog] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const r = useReversal();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    r.start(async () => {
      const res = await returnSale({
        orderId,
        reason: r.reason,
        password: r.password,
        key: r.key,
        items: items.map((i) => ({
          order_item_id: i.id,
          quantity: Math.max(0, parseDecimal(qty[i.id] ?? "") ?? 0),
        })),
      });
      if (res.ok) {
        toast.success(res.message);
        setOpenDialog(false);
        r.router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    <Dialog
      open={openDialog}
      onOpenChange={(o) => {
        if (o) {
          r.reset();
          setQty({});
        }
        setOpenDialog(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Undo2 />
          Devolver itens
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Devolução</DialogTitle>
            <DialogDescription>
              Informe quanto de cada item voltou. Produtos prontos voltam ao estoque e o valor (com
              o desconto da venda) é abatido do a receber ou lançado como estorno a pagar.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-3">
            {items.map((i) => {
              const max = i.quantity - i.returned;
              return (
                <li key={i.id} className="flex items-center gap-3">
                  <Label htmlFor={`ret-${i.id}`} className="min-w-0 flex-1">
                    <span className="block truncate">{i.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      Pode devolver até {max.toLocaleString("pt-BR")}
                    </span>
                  </Label>
                  <Input
                    id={`ret-${i.id}`}
                    inputMode="decimal"
                    placeholder="0"
                    value={qty[i.id] ?? ""}
                    onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
                    className="h-11 w-20 text-right"
                  />
                </li>
              );
            })}
          </ul>
          <ReasonAndPassword
            prefix="return"
            reason={r.reason}
            setReason={r.setReason}
            password={r.password}
            setPassword={r.setPassword}
          />
          <DialogFooter>
            <Button type="submit" className="min-h-11" disabled={r.pending}>
              {r.pending ? <Loader2 className="animate-spin" /> : <Undo2 />}
              Registrar devolução
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
