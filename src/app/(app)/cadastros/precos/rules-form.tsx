"use client";

import { Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CHANNEL_LABELS,
  SALES_CHANNELS,
  channelPrice,
  type SalesChannel,
} from "@/lib/catalog/pricing";
import { parseDecimal } from "@/lib/form-schemas";
import { formatCurrency } from "@/lib/format";
import { saveChannelRules } from "./actions";

const EXAMPLE_BASE = 100;

export function ChannelRulesForm({
  initial,
  canManage,
}: {
  initial: Record<SalesChannel, number>;
  canManage: boolean;
}) {
  const [values, setValues] = useState<Record<SalesChannel, string>>(
    () =>
      Object.fromEntries(
        SALES_CHANNELS.map((c) => [c, String(initial[c] ?? 0).replace(".", ",")]),
      ) as Record<SalesChannel, string>,
  );
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveChannelRules(values);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
        {SALES_CHANNELS.map((channel) => {
          const pct = parseDecimal(values[channel]);
          const example =
            pct === undefined || Number.isNaN(pct)
              ? null
              : channelPrice({ basePrice: EXAMPLE_BASE, adjustmentPct: pct });
          const id = `ajuste-${channel}`;
          return (
            <li key={channel} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-32 flex-1">
                <ChannelBadge channel={channel} />
              </div>
              <label htmlFor={id} className="sr-only">
                Ajuste para {CHANNEL_LABELS[channel]} (%)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={id}
                  inputMode="decimal"
                  className="w-24 text-right"
                  value={values[channel]}
                  disabled={!canManage}
                  onChange={(e) => setValues((v) => ({ ...v, [channel]: e.target.value }))}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="w-40 text-right text-sm text-muted-foreground">
                {formatCurrency(EXAMPLE_BASE)} →{" "}
                <span className="font-medium text-foreground">
                  {example === null ? "—" : formatCurrency(example)}
                </span>
              </p>
            </li>
          );
        })}
      </ul>
      {canManage && (
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar ajustes
        </Button>
      )}
    </form>
  );
}
