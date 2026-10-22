import { createHash, randomBytes, randomInt } from "node:crypto";

/** Letras e números sem os confusos (0/O, 1/I): fácil de ler na TV e digitar. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

export function newPairingCode() {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** Normaliza o que a pessoa digitou ("abc 234", "abc-234" → "ABC234"); null se inválido. */
export function normalizePairingCode(input: string) {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return CODE_RE.test(code) ? code : null;
}

/** Mostra o código em dois blocos ("ABC 234") para ler de longe. */
export function formatPairingCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function newPairingSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashPairingSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
