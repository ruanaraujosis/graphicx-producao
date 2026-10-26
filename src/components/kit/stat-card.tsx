import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "cn";

const TONES = {
  primary: "bg-accent text-accent-foreground",
  teal: "bg-secondary text-secondary-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-destructive/10 text-destructive",
} as const;

export type Tone = keyof typeof TONES;

/** Ícone dentro de um quadrado com fundo tingido. */
export function IconChip({
  icon: Icon,
  tone = "primary",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        TONES[tone],
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

/** Card de indicador (KPI): ícone, variação, valor grande e legenda. */
export function StatCard({
  icon,
  tone = "primary",
  value,
  label,
  trend,
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  value: React.ReactNode;
  label: string;
  /** Variação percentual em relação ao período anterior. */
  trend?: number;
  className?: string;
}) {
  const TrendIcon = trend !== undefined && trend < 0 ? TrendingDown : TrendingUp;
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <IconChip icon={icon} tone={tone} />
        {trend !== undefined && (
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-semibold",
              trend < 0 ? "text-destructive" : "text-success",
            )}
          >
            <TrendIcon className="size-3.5" aria-hidden />
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>
      <div>
        <p className="font-heading text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
