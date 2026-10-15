"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizePairingCode } from "@/lib/tv/pairing";
import { tvDeviceSchema, tvRotationSchema } from "./schema";

const PAGE = "/configuracoes/tv";

export async function saveTvDevice(input: unknown, id?: string): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const parsed = tvDeviceSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase
        .from("tv_devices")
        .update(parsed.data)
        .eq("id", id)
        .eq("organization_id", membership.organizationId)
    : await supabase
        .from("tv_devices")
        .insert({ ...parsed.data, organization_id: membership.organizationId });
  if (error)
    return {
      ok: false,
      error: dbErrorMessage(error, { fallback: "Não foi possível salvar a TV." }),
    };
  revalidatePath(PAGE);
  return { ok: true, message: id ? "TV atualizada." : "TV criada. Abra o link dela na TV." };
}

export async function revokeTvDevice(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tv_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", membership.organizationId);
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível revogar." }) };
  revalidatePath(PAGE);
  return { ok: true, message: "TV desligada. O link parou de funcionar." };
}

/** Liga de novo uma TV desligada (o mesmo link volta a funcionar). */
export async function turnOnTvDevice(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tv_devices")
    .update({ revoked_at: null })
    .eq("id", id)
    .eq("organization_id", membership.organizationId);
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível ligar." }) };
  revalidatePath(PAGE);
  return { ok: true, message: "TV ligada. O painel volta a abrir nela." };
}

export async function deleteTvDevice(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tv_devices")
    .delete()
    .eq("id", id)
    .eq("organization_id", membership.organizationId);
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível excluir." }) };
  revalidatePath(PAGE);
  return { ok: true, message: "TV excluída." };
}

const connectSchema = z.object({
  code: z.string().min(1, "Digite o código que aparece na TV."),
  device_id: z.string().nullable(),
  name: z.string().trim().max(60).optional(),
  show_financials: z.boolean().optional(),
});

/**
 * Conecta a TV que está mostrando o código (como no YouTube): liga o
 * pareamento a uma TV existente ou a uma nova. A TV entra no painel sozinha.
 */
export async function connectTvByCode(input: unknown): Promise<ActionResult> {
  const { session, membership } = await requireOrg("configuracoes.gerenciar");
  const org = membership.organizationId;
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const code = normalizePairingCode(parsed.data.code);
  if (!code) return { ok: false, error: "Código inválido. Confira as 6 letras e números da TV." };

  // Limite de tentativas por pessoa (evita adivinhar códigos).
  const db = createAdminClient();
  const { data: allowed } = await db.rpc("rate_limit_hit", {
    p_key: `tv-conectar:${session.id}`,
    p_limit: 20,
    p_window_seconds: 600,
  });
  if (allowed === false) return { ok: false, error: "Muitas tentativas. Espere alguns minutos." };

  const { data: pairing } = await db
    .from("tv_pairings")
    .select("id, expires_at, device_id")
    .eq("code", code)
    .is("linked_at", null)
    .maybeSingle();
  if (!pairing || new Date(pairing.expires_at).getTime() < Date.now())
    return { ok: false, error: "Código não encontrado ou vencido. Confira o código na TV." };

  // A TV escolhida precisa ser desta gráfica (conferido pela sessão/RLS).
  const supabase = await createClient();
  let deviceId = parsed.data.device_id;
  if (deviceId) {
    const { data: device } = await supabase
      .from("tv_devices")
      .select("id")
      .eq("id", deviceId)
      .eq("organization_id", org)
      .maybeSingle();
    if (!device) return { ok: false, error: "TV não encontrada." };
    await supabase.from("tv_devices").update({ revoked_at: null }).eq("id", deviceId);
  } else {
    const name = parsed.data.name?.trim();
    if (!name || name.length < 2) return { ok: false, error: "Dê um nome para a TV nova." };
    const { data: created, error } = await supabase
      .from("tv_devices")
      .insert({ organization_id: org, name, show_financials: parsed.data.show_financials ?? false })
      .select("id")
      .single();
    if (error || !created)
      return {
        ok: false,
        error: error
          ? dbErrorMessage(error, { fallback: "Não foi possível criar a TV." })
          : "Erro.",
      };
    deviceId = created.id;
  }

  const { error: linkError } = await db
    .from("tv_pairings")
    .update({ device_id: deviceId, organization_id: org, linked_at: new Date().toISOString() })
    .eq("id", pairing.id)
    .is("linked_at", null);
  if (linkError) return { ok: false, error: "Não foi possível conectar. Tente de novo." };
  revalidatePath(PAGE);
  return { ok: true, message: "TV conectada! O painel abre nela em poucos segundos." };
}

export async function saveTvRotation(input: unknown): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const parsed = tvRotationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Valor inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: membership.organizationId,
      tv_rotation_seconds: parsed.data.tv_rotation_seconds,
    },
    { onConflict: "organization_id" },
  );
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
  revalidatePath(PAGE);
  return { ok: true, message: "Tempo de cada tela salvo." };
}
