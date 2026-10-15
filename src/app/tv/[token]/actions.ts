"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isTvToken, loadTvSnapshot, type TvSnapshot } from "./data";

/** Atualização periódica do painel (a TV não tem login: o token autoriza). */
export async function refreshTv(token: string): Promise<TvSnapshot | null> {
  return loadTvSnapshot(token);
}

export type TvCommand = {
  active: boolean;
  screen: string | null;
  at: string | null;
  by: string | null;
};

/** "Reproduzir na TV": qual tela alguém mandou para esta TV (consulta leve, a cada poucos segundos). */
export async function tvCommand(token: string): Promise<TvCommand> {
  if (!isTvToken(token)) return { active: false, screen: null, at: null, by: null };
  const { data } = await createAdminClient().rpc("tv_command", { p_token: token });
  const c = (data ?? {}) as Partial<TvCommand>;
  return {
    active: Boolean(c.active),
    screen: c.screen ?? null,
    at: c.at ?? null,
    by: c.by ?? null,
  };
}
