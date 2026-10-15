import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPairingSecret, newPairingCode, newPairingSecret } from "@/lib/tv/pairing";

/**
 * Pareamento da TV por código (rota pública, usada pela página /tv).
 *  POST: gera um código novo e o segredo que só a TV conhece.
 *  GET (cabeçalho x-tv-secret): diz se já foi conectada e devolve o endereço do painel.
 */

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function allowed(bucket: string, limit: number) {
  const ip = clientIp(await headers());
  const { data } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: `${bucket}:${ip}`,
    p_limit: limit,
    p_window_seconds: 600,
  });
  return data !== false;
}

export async function POST() {
  if (!(await allowed("tv-codigo", 30)))
    return json({ error: "Muitas tentativas. Espere alguns minutos." }, 429);
  const db = createAdminClient();
  // Faxina dos pareamentos vencidos.
  await db
    .from("tv_pairings")
    .delete()
    .lt("expires_at", new Date(Date.now() - 3_600_000).toISOString());

  const secret = newPairingSecret();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newPairingCode();
    const { data, error } = await db
      .from("tv_pairings")
      .insert({ code, secret_hash: hashPairingSecret(secret) })
      .select("code, expires_at")
      .single();
    if (!error && data) return json({ code: data.code, secret, expiresAt: data.expires_at });
    if (error?.code !== "23505") break; // só tenta de novo se o código já estava em uso
  }
  return json({ error: "Não foi possível gerar o código. Tente de novo." }, 500);
}

export async function GET(request: Request) {
  const secret = request.headers.get("x-tv-secret") ?? "";
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(secret)) return json({ error: "Pedido inválido." }, 400);
  if (!(await allowed("tv-espera", 400))) return json({ error: "Muitas tentativas." }, 429);

  const db = createAdminClient();
  const { data: pairing } = await db
    .from("tv_pairings")
    .select("id, device_id, expires_at, linked_at")
    .eq("secret_hash", hashPairingSecret(secret))
    .maybeSingle();
  if (!pairing) return json({ status: "expirada" });
  if (!pairing.device_id) {
    return json({
      status: new Date(pairing.expires_at).getTime() < Date.now() ? "expirada" : "aguardando",
    });
  }
  const { data: device } = await db
    .from("tv_devices")
    .select("token, revoked_at")
    .eq("id", pairing.device_id)
    .maybeSingle();
  // Uso único: depois de entregar o endereço, o pareamento some.
  await db.from("tv_pairings").delete().eq("id", pairing.id);
  if (!device || device.revoked_at) return json({ status: "expirada" });
  return json({ status: "conectada", url: `/tv/${device.token}` });
}
