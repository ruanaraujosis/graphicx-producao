"use client";

import {
  AlarmClock,
  Boxes,
  Cast,
  Factory,
  Maximize,
  Palette,
  Store,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "cn";
import { LogoMark } from "@/components/brand/logo";
import { CHANNEL_LABELS } from "@/lib/catalog/pricing";
import { goalsFromMonthly, progressPct } from "@/lib/finance/goals";
import { formatCurrency } from "@/lib/format";
import { dueRisk, formatDueDate } from "@/lib/orders/deadline";
import { BOARD_STATUSES, STATUS_LABELS, orderNumber } from "@/lib/orders/status";
import { formatQuantity, type Unit } from "@/lib/stock/units";
import { refreshTv, tvCommand } from "./actions";
import type { TvSnapshot } from "./data";

const REFRESH_MS = 30_000;
/** Intervalo para ver se alguém mandou uma tela pelo "Reproduzir na TV". */
const CAST_POLL_MS = 4_000;

type Screen = { key: string; title: string; icon: typeof Factory; render: () => React.ReactNode };

/** Painel da TV: gira entre as telas e atualiza os dados a cada 30 s. */
export function TvBoard({ token, initial }: { token: string; initial: TvSnapshot }) {
  const [data, setData] = useState(initial);
  const [offline, setOffline] = useState(false);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState<Date | null>(null);

  // Dados novos a cada 30 s (sem login não há Realtime).
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const next = await refreshTv(token);
        if (next) {
          setData(next);
          setOffline(false);
        } else {
          // TV desligada ou excluída: recarrega para mostrar o aviso e o "Conectar com código".
          window.location.reload();
        }
      } catch {
        setOffline(true);
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [token]);

  // Relógio.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // "Reproduzir na TV": alguém do GraphicX fixou uma tela (consulta leve a cada 4 s).
  const [cast, setCast] = useState<{ screen: string | null; by: string | null }>({
    screen: null,
    by: null,
  });
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const c = await tvCommand(token);
        if (!c.active) {
          window.location.reload();
          return;
        }
        setCast((prev) =>
          prev.screen === c.screen && prev.by === c.by ? prev : { screen: c.screen, by: c.by },
        );
      } catch {
        // Sem conexão: o aviso aparece na próxima atualização dos dados.
      }
    }, CAST_POLL_MS);
    return () => clearInterval(id);
  }, [token]);

  const screens = useMemo(() => buildScreens(data), [data]);
  const pinned = cast.screen ? screens.findIndex((s) => s.key === cast.screen) : -1;
  const shown = pinned >= 0 ? pinned : index % screens.length;
  const current = screens[shown];

  // Rotação automática (pausada enquanto uma tela está sendo reproduzida).
  useEffect(() => {
    if (pinned >= 0) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % screens.length),
      data.rotation_seconds * 1000,
    );
    return () => clearInterval(id);
  }, [screens.length, data.rotation_seconds, pinned]);

  const Icon = current.icon;
  return (
    <main
      className="flex min-h-dvh cursor-pointer flex-col gap-6 p-6 select-none lg:p-10"
      onClick={() => {
        if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
      }}
    >
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <LogoMark className="h-10" title="" />
          <div>
            <p className="text-2xl font-bold">{data.organization}</p>
            <p className="text-lg text-muted-foreground">{data.device}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold tabular-nums">
            {now
              ? now.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Sao_Paulo",
                })
              : "--:--"}
          </p>
          <p className="text-lg text-muted-foreground">{formatDueDate(data.today)}</p>
        </div>
      </header>

      <div className="flex items-center gap-3">
        <Icon className="size-9 text-primary" aria-hidden />
        <h1 className="text-4xl font-bold tracking-tight">{current.title}</h1>
        {pinned >= 0 && (
          <span className="flex items-center gap-2 rounded-full bg-primary/15 px-4 py-1 text-lg font-medium text-primary">
            <Cast className="size-5" aria-hidden />
            Reproduzindo{cast.by ? ` — enviado por ${cast.by}` : ""}
          </span>
        )}
        {offline && (
          <span className="ml-auto rounded-full bg-destructive px-4 py-1 text-lg font-semibold text-white">
            Sem conexão — mostrando os últimos dados
          </span>
        )}
      </div>

      <section className="flex-1">{current.render()}</section>

      <footer className="flex items-center justify-between gap-4">
        <div className="flex gap-2" aria-label="Telas">
          {screens.map((s, i) => (
            <span
              key={s.key}
              className={cn("h-2.5 w-10 rounded-full", i === shown ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Maximize className="size-4" aria-hidden />
          Toque para tela cheia
        </span>
      </footer>
    </main>
  );
}

function buildScreens(data: TvSnapshot): Screen[] {
  const today = data.today;
  const screens: Screen[] = [
    {
      key: "board",
      title: "Produção agora",
      icon: Factory,
      render: () => (
        <div className="grid h-full grid-cols-2 gap-4 md:grid-cols-5">
          {BOARD_STATUSES.map((s) => (
            <div key={s} className="flex flex-col justify-between rounded-3xl border bg-card p-5">
              <span className="text-xl text-muted-foreground">{STATUS_LABELS[s]}</span>
              <span className="text-7xl font-bold tabular-nums">{data.board[s] ?? 0}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "due",
      title: "Postagens de hoje e atrasadas",
      icon: AlarmClock,
      render: () =>
        data.due.length === 0 ? (
          <Empty text="Nenhum pedido vencendo hoje. 👏" />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {data.due.slice(0, 12).map((o) => {
              const late = dueRisk(o.due_date, today) === "atrasado";
              return (
                <li
                  key={o.number}
                  className={cn(
                    "flex items-center justify-between gap-4 rounded-2xl border p-4",
                    late ? "border-destructive bg-destructive/15" : "bg-card",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-3xl font-bold">{orderNumber(o.number)}</p>
                    <p className="truncate text-xl text-muted-foreground">{o.customer}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-2xl font-semibold", late && "text-destructive")}>
                      {late ? `Atrasado (${formatDueDate(o.due_date).slice(0, 5)})` : "Posta hoje"}
                    </p>
                    <p className="text-lg text-muted-foreground">{STATUS_LABELS[o.status]}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ),
    },
    {
      key: "art",
      title: "Artes esperando o cliente aprovar",
      icon: Palette,
      render: () =>
        data.art_waiting.length === 0 ? (
          <Empty text="Nenhuma prova esperando o cliente." />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-3">
            {data.art_waiting.slice(0, 12).map((o) => (
              <li key={o.number} className="rounded-2xl border bg-card p-4">
                <p className="text-3xl font-bold">{orderNumber(o.number)}</p>
                <p className="truncate text-xl text-muted-foreground">{o.customer}</p>
                <p className="text-lg text-muted-foreground">desde {formatSince(o.since)}</p>
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: "revenue",
      title: data.show_financials ? "Faturamento e meta" : "Pedidos de hoje",
      icon: TrendingUp,
      render: () => {
        if (!data.show_financials || !data.revenue) {
          return (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <span className="text-9xl font-bold tabular-nums">{data.orders_today}</span>
              <span className="text-3xl text-muted-foreground">pedidos confirmados hoje</span>
            </div>
          );
        }
        const goals = goalsFromMonthly(data.monthly_goal, today);
        const items = [
          { label: "Hoje", value: data.revenue.day, goal: goals.day },
          { label: "Semana", value: data.revenue.week, goal: goals.week },
          { label: "Mês", value: data.revenue.month, goal: goals.month },
        ];
        return (
          <div className="grid gap-4 md:grid-cols-3">
            {items.map((it) => {
              const pct = progressPct(it.value, it.goal);
              return (
                <div key={it.label} className="flex flex-col gap-4 rounded-3xl border bg-card p-6">
                  <span className="text-2xl text-muted-foreground">{it.label}</span>
                  <span className="text-5xl font-bold tabular-nums">
                    {formatCurrency(it.value)}
                  </span>
                  {it.goal > 0 ? (
                    <>
                      <div className="h-5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            pct >= 100 ? "bg-success" : "bg-primary",
                          )}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="text-xl text-muted-foreground">
                        {pct}% da meta de {formatCurrency(it.goal)}
                      </span>
                    </>
                  ) : (
                    <span className="text-xl text-muted-foreground">Sem meta definida</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      key: "channels",
      title: "Vendas do mês por canal",
      icon: Store,
      render: () =>
        data.by_channel.length === 0 ? (
          <Empty text="Nenhuma venda confirmada no mês ainda." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-5">
            {data.by_channel.map((c) => (
              <li key={c.channel} className="flex flex-col gap-2 rounded-3xl border bg-card p-6">
                <span className="text-2xl text-muted-foreground">{CHANNEL_LABELS[c.channel]}</span>
                <span className="text-6xl font-bold tabular-nums">{c.orders}</span>
                <span className="text-xl text-muted-foreground">pedidos</span>
                {data.show_financials && c.amount !== null && (
                  <span className="text-2xl font-semibold">{formatCurrency(c.amount)}</span>
                )}
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: "stock",
      title: "Estoque crítico",
      icon: Boxes,
      render: () =>
        data.critical_stock.length === 0 ? (
          <Empty text="Nenhum insumo abaixo do mínimo." />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {data.critical_stock.map((m) => (
              <li
                key={m.name}
                className="flex items-center justify-between gap-4 rounded-2xl border border-warning bg-warning/10 p-4"
              >
                <span className="truncate text-2xl font-semibold">{m.name}</span>
                <span className="text-right text-xl">
                  <strong className="text-2xl">
                    {formatQuantity(m.available, m.unit as Unit)}
                  </strong>
                  <span className="block text-muted-foreground">
                    mínimo {formatQuantity(m.min, m.unit as Unit)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ),
    },
  ];
  return screens;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-60 items-center justify-center rounded-3xl border border-dashed text-3xl text-muted-foreground">
      {text}
    </div>
  );
}

function formatSince(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
