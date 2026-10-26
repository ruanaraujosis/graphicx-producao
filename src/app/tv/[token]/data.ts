import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/lib/orders/status";
import type { SalesChannel } from "@/lib/catalog/pricing";

export type TvSnapshot = {
  organization: string;
  device: string;
  today: string;
  show_financials: boolean;
  rotation_seconds: number;
  monthly_goal: number | null;
  board: Partial<Record<OrderStatus, number>>;
  due: {
    number: number;
    customer: string;
    due_date: string;
    status: OrderStatus;
    channel: SalesChannel;
  }[];
  art_waiting: { number: number; customer: string; since: string }[];
  orders_today: number;
  revenue: { day: number; week: number; month: number } | null;
  by_channel: { channel: SalesChannel; orders: number; amount: number | null }[];
  critical_stock: { name: string; unit: string; available: number; min: number }[];
};

/** Formato do token (base64url, 32+). Barra lixo antes de ir ao banco. */
export function isTvToken(token: string) {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token);
}

/** Tudo o que a TV mostra, numa consulta só (o banco valida o token e a revogação). */
export async function loadTvSnapshot(token: string): Promise<TvSnapshot | null> {
  if (!isTvToken(token)) return null;
  const { data, error } = await createAdminClient().rpc("tv_snapshot", { p_token: token });
  if (error || !data) return null;
  return data as unknown as TvSnapshot;
}
