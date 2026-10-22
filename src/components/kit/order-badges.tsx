import { AlarmClock, CalendarClock } from "lucide-react";
import { cn } from "cn";
import { DUE_RISK_LABELS, dueRisk, formatDueDate, type DueRisk } from "@/lib/orders/deadline";
import { STATUS_LABELS, STATUS_TONES, isOpen, type OrderStatus } from "@/lib/orders/status";

const TONE_CLASSES = {
  muted: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  primary: "bg-primary/10 text-primary",
  teal: "bg-brand-teal/12 text-brand-teal",
  success: "bg-success-soft text-success",
  danger: "bg-destructive/10 text-destructive",
} as const;

export function StatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[STATUS_TONES[status]],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const RISK_CLASSES: Record<DueRisk, string> = {
  atrasado: "bg-destructive text-white",
  hoje: "bg-destructive/10 text-destructive",
  amanha: "bg-warning-soft text-warning",
  ok: "bg-muted text-muted-foreground",
};

/**
 * Data limite de postagem. Em vermelho quando atrasado ou vence hoje.
 * Para pedidos fechados mostra só a data, sem alerta.
 */
export function DueBadge({
  due,
  status,
  today,
  className,
}: {
  due: string | null;
  status: OrderStatus;
  today?: string;
  className?: string;
}) {
  if (!due) return null;
  const risk = isOpen(status) ? dueRisk(due, today) : null;
  const Icon = risk === "atrasado" || risk === "hoje" ? AlarmClock : CalendarClock;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        risk ? RISK_CLASSES[risk] : RISK_CLASSES.ok,
        className,
      )}
      title={risk ? DUE_RISK_LABELS[risk] : undefined}
    >
      <Icon className="size-3.5" aria-hidden />
      {formatDueDate(due).slice(0, 5)}
      {risk && risk !== "ok" && (
        <span className="sr-only sm:not-sr-only">· {DUE_RISK_LABELS[risk]}</span>
      )}
    </span>
  );
}
