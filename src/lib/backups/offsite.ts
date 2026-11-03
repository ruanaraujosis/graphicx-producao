import "server-only";
import { AwsClient } from "aws4fetch";

/**
 * Cópia externa dos backups no Cloudflare R2 (API compatível com S3), fora do Supabase: se o
 * projeto inteiro se perder, os backups continuam existindo. Só arquivos já criptografados
 * saem para cá. Credenciais só na Vercel: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY e R2_BUCKET (token do R2 com leitura e escrita só nesse bucket).
 */

export type OffsiteConfig = { client: AwsClient; base: string };

const ACCOUNT = /^[0-9a-f]{32}$/;
const BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/** Configuração do R2, ou null se ainda não houver. Valores malformados viram erro claro. */
export function offsiteFromEnv(env: Record<string, string | undefined> = process.env) {
  const account = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  if (!account && !accessKeyId && !secretAccessKey && !bucket) return null;
  if (!account || !ACCOUNT.test(account)) throw new Error("R2_ACCOUNT_ID ausente ou inválido.");
  if (!bucket || !BUCKET.test(bucket)) throw new Error("R2_BUCKET ausente ou inválido.");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY precisam estar definidos.");
  }
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    base: `https://${account}.r2.cloudflarestorage.com/${bucket}`,
  } satisfies OffsiteConfig;
}

const objectUrl = ({ base }: OffsiteConfig, path: string) =>
  `${base}/${path.split("/").map(encodeURIComponent).join("/")}`;

export async function uploadOffsite(config: OffsiteConfig, path: string, bytes: Buffer) {
  const response = await config.client.fetch(objectUrl(config, path), {
    method: "PUT",
    body: new Uint8Array(bytes),
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (!response.ok) throw new Error(`R2 respondeu ${response.status} ao gravar a cópia.`);
}

/**
 * Apaga cópias externas (retenção). Falhas não interrompem o backup; a regra de expiração do
 * bucket (README) apaga o que sobrar.
 */
export async function removeOffsite(config: OffsiteConfig, paths: string[]) {
  await Promise.allSettled(
    paths.map((p) => config.client.fetch(objectUrl(config, p), { method: "DELETE" })),
  );
}
