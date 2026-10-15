import { timingSafeEqual } from "node:crypto";

/** Cookie com o estado da autorização (nonce.organização), válido por 10 minutos. */
export const MARKETPLACE_STATE_COOKIE = "gx_mkt_state";

/** Confere o estado devolvido pelo marketplace contra o cookie e a gráfica ativa. */
export function checkOAuthState(
  saved: string | undefined,
  returned: string | null,
  organizationId: string,
) {
  const [nonce, orgId] = (saved ?? "").split(".");
  if (!nonce || !returned || orgId !== organizationId) return false;
  const a = Buffer.from(nonce);
  const b = Buffer.from(returned);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Compara segredos em tempo constante. */
export function sameSecret(expected: string, got: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
