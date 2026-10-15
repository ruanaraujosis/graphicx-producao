"use server";

import { requireOrg } from "@/lib/auth/dal";
import type { ActionResult } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { isTvScreen, TV_SCREENS } from "./screens";

/** TVs da gráfica para o "Reproduzir na TV" (qualquer pessoa da gráfica vê). */
export async function listCastTargets() {
  const { membership } = await requireOrg();
  const supabase = await createClient();
  const { data } = await supabase.rpc("tv_cast_targets", { p_org: membership.organizationId });
  const now = Date.now();
  return (data ?? [])
    .filter((d) => !d.revoked)
    .map((d) => ({
      id: d.id,
      name: d.name,
      // "Ligada agora": a TV consultou o servidor no último minuto e meio.
      online: d.last_seen_at ? now - new Date(d.last_seen_at).getTime() < 90_000 : false,
      castScreen: isTvScreen(d.cast_screen) ? d.cast_screen : null,
    }));
}

/** Manda a tela para a TV (ou, com screen nulo, volta a girar as telas). */
export async function castToTv(deviceId: string, screen: string | null): Promise<ActionResult> {
  await requireOrg();
  if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return { ok: false, error: "TV inválida." };
  if (screen !== null && !isTvScreen(screen)) return { ok: false, error: "Tela inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("tv_cast", { p_device: deviceId, p_screen: screen });
  if (error) return { ok: false, error: "Não foi possível enviar para a TV. Ela está ligada?" };
  return {
    ok: true,
    message: screen
      ? `Reproduzindo “${TV_SCREENS[screen]}” na TV.`
      : "A TV voltou a mostrar todas as telas.",
  };
}
