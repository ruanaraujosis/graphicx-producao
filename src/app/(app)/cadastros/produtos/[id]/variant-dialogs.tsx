"use client";

import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { EntityFormDialog, type FieldConfig } from "@/components/kit/entity-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHANNEL_LABELS,
  SALES_CHANNELS,
  channelPrice,
  type SalesChannel,
} from "@/lib/catalog/pricing";
import { parseDecimal } from "@/lib/form-schemas";
import { formatCurrency } from "@/lib/format";
import { bomUnitCost } from "@/lib/stock/cost";
import { UNIT_SHORT, type Unit } from "@/lib/stock/units";
import { copyBom, saveBom, saveVariant, saveVariantPrices } from "../actions";
import { variantSchema } from "../schema";

export type VariantView = {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  base_price: number;
  weight_g: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  active: boolean;
  overrides: Partial<Record<SalesChannel, number>>;
  bom: { material_id: string; quantity: number; waste_pct: number }[];
};

export type MaterialOption = { id: string; name: string; unit: Unit; avg_cost: number };

const br = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : String(n).replace(".", ",");

const VARIANT_FIELDS: FieldConfig[] = [
  { name: "name", label: "Nome da variação", placeholder: "Ex.: 5x5 cm · 3 mm · cristal" },
  { name: "sku", label: "SKU", half: true, placeholder: "CHAV-5X5-3MM" },
  {
    name: "base_price",
    label: "Preço base (R$)",
    type: "number",
    half: true,
    hint: "Os canais aplicam o ajuste sobre ele.",
  },
  { name: "tamanho", label: "Tamanho", half: true, placeholder: "5x5 cm" },
  { name: "espessura", label: "Espessura", half: true, placeholder: "3 mm" },
  { name: "cor", label: "Cor", half: true, placeholder: "Cristal" },
  { name: "acabamento", label: "Acabamento", half: true, placeholder: "Impressão UV" },
  {
    name: "weight_g",
    label: "Peso (g)",
    type: "number",
    inputMode: "numeric",
    half: true,
    hint: "Para frete.",
  },
  { name: "length_cm", label: "Comprimento (cm)", type: "number", half: true },
  { name: "width_cm", label: "Largura (cm)", type: "number", half: true },
  { name: "height_cm", label: "Altura (cm)", type: "number", half: true },
];

export function VariantFormDialog({
  productId,
  variant,
  trigger,
}: {
  productId: string;
  variant?: VariantView;
  trigger: React.ReactElement;
}) {
  return (
    <EntityFormDialog
      wide
      title={variant ? `Editar variação ${variant.sku}` : "Nova variação"}
      trigger={trigger}
      schema={variantSchema}
      defaultValues={{
        name: variant?.name ?? "",
        sku: variant?.sku ?? "",
        base_price: br(variant?.base_price ?? 0),
        tamanho: variant?.attributes.tamanho ?? "",
        espessura: variant?.attributes.espessura ?? "",
        cor: variant?.attributes.cor ?? "",
        acabamento: variant?.attributes.acabamento ?? "",
        weight_g: br(variant?.weight_g),
        length_cm: br(variant?.length_cm),
        width_cm: br(variant?.width_cm),
        height_cm: br(variant?.height_cm),
        active: variant?.active ?? true,
      }}
      fields={
        variant
          ? [...VARIANT_FIELDS, { name: "active", label: "Variação ativa", type: "switch" }]
          : VARIANT_FIELDS
      }
      action={(values) => saveVariant(productId, variant?.id ?? null, values)}
      submitLabel={variant ? "Salvar" : "Criar variação"}
    />
  );
}

/** Preço final por canal, com opção de preço manual. */
export function VariantPricesDialog({
  variant,
  rules,
  trigger,
}: {
  variant: VariantView;
  rules: Record<SalesChannel, number>;
  trigger: React.ReactElement;
}) {
  const initial = () =>
    Object.fromEntries(SALES_CHANNELS.map((c) => [c, br(variant.overrides[c])])) as Record<
      SalesChannel,
      string
    >;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValues(initial());
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preços de {variant.sku}</DialogTitle>
          <DialogDescription>
            Preço base {formatCurrency(variant.base_price)}. Deixe em branco para usar o ajuste do
            canal; preencha para fixar um preço manual.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {SALES_CHANNELS.map((channel) => {
            const auto = channelPrice({
              basePrice: variant.base_price,
              adjustmentPct: rules[channel],
            });
            const id = `preco-${variant.id}-${channel}`;
            return (
              <li key={channel} className="flex items-center gap-3">
                <div className="flex-1">
                  <ChannelBadge channel={channel} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Automático: {formatCurrency(auto)} ({rules[channel] >= 0 ? "+" : ""}
                    {br(rules[channel])}%)
                  </p>
                </div>
                <Label htmlFor={id} className="sr-only">
                  Preço manual {CHANNEL_LABELS[channel]}
                </Label>
                <Input
                  id={id}
                  inputMode="decimal"
                  placeholder={br(auto)}
                  className="w-28 text-right"
                  value={values[channel]}
                  onChange={(e) => setValues((v) => ({ ...v, [channel]: e.target.value }))}
                />
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveVariantPrices(variant.id, values);
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                } else toast.error(result.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Salvar preços
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BomRow = { material_id: string; quantity: string; waste_pct: string };

/** Ficha técnica: insumos consumidos por unidade, com perda e custo calculado. */
export function BomDialog({
  variant,
  materials,
  trigger,
}: {
  variant: VariantView;
  materials: readonly MaterialOption[];
  trigger: React.ReactElement;
}) {
  const initial = (): BomRow[] =>
    variant.bom.map((b) => ({
      material_id: b.material_id,
      quantity: br(b.quantity),
      waste_pct: br(b.waste_pct),
    }));
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BomRow[]>(initial);
  const baseId = useId();
  const [pending, startTransition] = useTransition();
  const byId = new Map(materials.map((m) => [m.id, m]));

  const cost = bomUnitCost(
    rows.flatMap((r) => {
      const m = byId.get(r.material_id);
      const qty = parseDecimal(r.quantity);
      if (!m || qty === undefined || Number.isNaN(qty)) return [];
      return [{ quantity: qty, wastePct: parseDecimal(r.waste_pct) || 0, avgCost: m.avg_cost }];
    }),
  );

  const update = (i: number, patch: Partial<BomRow>) =>
    setRows((list) => list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRows(initial());
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ficha técnica de {variant.sku}</DialogTitle>
          <DialogDescription>
            Quanto de cada insumo uma unidade consome. A perda (%) cobre refugo e sobras de corte.
          </DialogDescription>
        </DialogHeader>
        {materials.length === 0 ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            Cadastre os insumos primeiro, em Cadastros → Insumos.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row, i) => {
              const m = byId.get(row.material_id);
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_7rem_6rem_auto] sm:items-end"
                >
                  <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                    <Label htmlFor={`${baseId}-${i}-material`} className="text-xs">
                      Insumo
                    </Label>
                    <Select
                      value={row.material_id}
                      onValueChange={(v) => update(i, { material_id: v })}
                    >
                      <SelectTrigger id={`${baseId}-${i}-material`} className="w-full">
                        <SelectValue placeholder="Escolha o insumo" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials.map((mat) => (
                          <SelectItem key={mat.id} value={mat.id}>
                            {mat.name} ({UNIT_SHORT[mat.unit]})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${baseId}-${i}-qty`} className="text-xs">
                      Qtd {m ? `(${UNIT_SHORT[m.unit]})` : ""}
                    </Label>
                    <Input
                      id={`${baseId}-${i}-qty`}
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => update(i, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${baseId}-${i}-waste`} className="text-xs">
                      Perda %
                    </Label>
                    <Input
                      id={`${baseId}-${i}-waste`}
                      inputMode="decimal"
                      value={row.waste_pct}
                      onChange={(e) => update(i, { waste_pct: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover insumo"
                    className="self-end"
                    onClick={() => setRows((list) => list.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              className="self-start"
              onClick={() =>
                setRows((list) => [...list, { material_id: "", quantity: "1", waste_pct: "0" }])
              }
            >
              <Plus />
              Adicionar insumo
            </Button>
            <p className="rounded-xl bg-muted p-3 text-sm">
              Custo dos insumos por unidade: <strong>{formatCurrency(cost)}</strong>
            </p>
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={pending || materials.length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await saveBom(variant.id, rows);
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                } else toast.error(result.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Salvar ficha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CopyBomDialog({
  from,
  siblings,
}: {
  from: VariantView;
  siblings: readonly { id: string; sku: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSelected([]);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={from.bom.length === 0 || siblings.length === 0}>
          <Copy />
          Copiar ficha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copiar ficha de {from.sku}</DialogTitle>
          <DialogDescription>
            A ficha das variações escolhidas será substituída por esta.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {siblings.map((s) => (
            <li key={s.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted">
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={(c) =>
                    setSelected((list) => (c ? [...list, s.id] : list.filter((id) => id !== s.id)))
                  }
                />
                <span className="text-sm">
                  <span className="font-mono">{s.sku}</span> · {s.name}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            disabled={pending || selected.length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await copyBom(from.id, selected);
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                } else toast.error(result.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Copiar para {selected.length || ""} variação(ões)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
