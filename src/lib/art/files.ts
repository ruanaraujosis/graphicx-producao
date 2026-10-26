/** Regras dos arquivos de arte (valem no navegador e no servidor). */

export const ART_BUCKET = "artes";

/** Pastas dentro de {gráfica}/{pedido}/. */
export type ArtFolder = "cliente" | "provas" | "final";

/** Limite do bucket (50 MB). */
export const MAX_ART_FILE_BYTES = 50 * 1024 * 1024;
/** Provas são processadas no servidor: limite menor. */
export const MAX_PROOF_BYTES = 25 * 1024 * 1024;

export const PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type ProofMime = (typeof PROOF_MIME_TYPES)[number];

export function isProofMime(mime: string): mime is ProofMime {
  return (PROOF_MIME_TYPES as readonly string[]).includes(mime);
}

/** Nome de arquivo seguro para o Storage: sem acentos, espaços ou barras. */
export function safeFileName(fullName: string) {
  // Só o nome, sem pastas (o navegador às vezes manda o caminho).
  const name = fullName.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 8)
      : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase();
  return `${base || "arquivo"}${ext ? `.${ext}` : ""}`;
}

/** Caminho {gráfica}/{pedido}/{pasta}/{aleatório}-{nome}. */
export function artPath(org: string, order: string, folder: ArtFolder, fileName: string) {
  return `${org}/${order}/${folder}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

/** Confere se o caminho pertence à pasta do pedido. */
export function isArtPathOf(path: string, org: string, order: string, folder: ArtFolder) {
  const prefix = `${org}/${order}/${folder}/`;
  return (
    path.startsWith(prefix) && !path.slice(prefix.length).includes("/") && !path.includes("..")
  );
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
