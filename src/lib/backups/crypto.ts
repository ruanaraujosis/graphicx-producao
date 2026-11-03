import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Criptografia dos backups (AES-256-GCM). A chave fica só na variável de ambiente
 * BACKUP_ENCRYPTION_KEY (32 bytes em base64), nunca no banco nem no armazenamento.
 *
 * Arquivo: "GXB1" | impressão da chave (8 bytes) | tamanho do id da gráfica (1) | id da gráfica |
 * IV (12) | tag (16) | conteúdo. O cabeçalho entra como dado autenticado: trocar o arquivo de
 * gráfica ou adulterá-lo faz a abertura falhar.
 */

export const BACKUP_KEY_ENV = "BACKUP_ENCRYPTION_KEY";
const MAGIC = Buffer.from("GXB1");
const FP_BYTES = 8;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type BackupKey = { key: Buffer; fingerprint: string };

/** Impressão da chave (não revela a chave): identifica qual chave abre cada arquivo. */
function fingerprintOf(key: Buffer) {
  return createHash("sha256").update(key).digest().subarray(0, FP_BYTES);
}

export function parseBackupKey(raw: string | undefined): BackupKey | null {
  const value = raw?.trim();
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error(`${BACKUP_KEY_ENV} inválida: use 32 bytes aleatórios em base64.`);
  }
  return { key, fingerprint: fingerprintOf(key).toString("hex") };
}

/** Chave configurada no servidor, ou null se ainda não houver. */
export function backupKeyFromEnv() {
  return parseBackupKey(process.env[BACKUP_KEY_ENV]);
}

function header(fingerprint: Buffer, org: string) {
  const orgBytes = Buffer.from(org, "utf8");
  if (orgBytes.length > 255) throw new Error("Identificador da gráfica muito longo.");
  return Buffer.concat([MAGIC, fingerprint, Buffer.from([orgBytes.length]), orgBytes]);
}

export function encryptBackup(plain: Buffer, org: string, { key }: BackupKey) {
  const head = header(fingerprintOf(key), org);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(head);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([head, iv, cipher.getAuthTag(), body]);
}

export function isEncryptedBackup(data: Buffer) {
  return data.subarray(0, MAGIC.length).equals(MAGIC);
}

/** Abre um backup criptografado. Devolve o conteúdo e a gráfica a que ele pertence. */
export function decryptBackup(data: Buffer, { key }: BackupKey) {
  if (!isEncryptedBackup(data))
    throw new Error("Arquivo não é um backup criptografado do GraphicX.");
  const fp = data.subarray(MAGIC.length, MAGIC.length + FP_BYTES);
  if (!fp.equals(fingerprintOf(key))) {
    throw new Error("Este backup foi criptografado com outra chave.");
  }
  const orgLength = data[MAGIC.length + FP_BYTES];
  const headLength = MAGIC.length + FP_BYTES + 1 + orgLength;
  const head = data.subarray(0, headLength);
  const org = head.subarray(MAGIC.length + FP_BYTES + 1).toString("utf8");
  const iv = data.subarray(headLength, headLength + IV_BYTES);
  const tag = data.subarray(headLength + IV_BYTES, headLength + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(head);
  decipher.setAuthTag(tag);
  try {
    const plain = Buffer.concat([
      decipher.update(data.subarray(headLength + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
    return { plain, organizationId: org };
  } catch {
    throw new Error("Backup corrompido ou adulterado: a verificação de integridade falhou.");
  }
}
