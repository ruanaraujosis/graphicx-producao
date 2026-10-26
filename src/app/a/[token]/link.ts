/** Formato do token do link (base64url, 32+ caracteres). Barra lixo antes de ir ao banco. */
export function isTokenFormat(token: string) {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token);
}

export { clientIp } from "@/lib/client-ip";
