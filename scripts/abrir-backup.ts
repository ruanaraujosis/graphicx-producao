/**
 * Abre um backup criptografado da graphicX (para restaurar ou conferir).
 *
 *   npm run backup:abrir -- <arquivo.json.gz.enc> [saida.json]
 *
 * A chave vem de BACKUP_ENCRYPTION_KEY no .env.producao.local (a mesma da Vercel de produção).
 * O resultado tem dados pessoais das gráficas: guarde fora do repositório e apague depois de usar.
 * Nada do conteúdo é exibido no terminal, só o resumo.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { backupKeyFromEnv, decryptBackup, isEncryptedBackup } from "../src/lib/backups/crypto";

const [input, output = input?.replace(/(\.json)?\.gz(\.enc)?$/, "") + ".json"] =
  process.argv.slice(2);

if (!input || !existsSync(input)) {
  console.error("Uso: npm run backup:abrir -- <arquivo.json.gz.enc> [saida.json]");
  process.exit(1);
}
if (existsSync(output)) {
  console.error(`✖ ${output} já existe. Escolha outro destino.`);
  process.exit(1);
}

const data = readFileSync(input);
let packed = data;
if (isEncryptedBackup(data)) {
  const key = backupKeyFromEnv();
  if (!key) {
    console.error("✖ BACKUP_ENCRYPTION_KEY não está no .env.producao.local.");
    process.exit(1);
  }
  const { plain, organizationId } = decryptBackup(data, key);
  packed = plain;
  console.log(`✔ Integridade conferida · gráfica ${organizationId}`);
} else {
  console.log("⚠ Backup antigo, sem criptografia: só descompactando.");
}

const json = gunzipSync(packed);
const file = JSON.parse(json.toString("utf8")) as { tables: Record<string, unknown[]> };
writeFileSync(output, json);
const rows = Object.values(file.tables).reduce((s, t) => s + t.length, 0);
console.log(`✔ ${Object.keys(file.tables).length} tabelas, ${rows} registros → ${output}`);
console.log("  Contém dados pessoais: não versione e apague quando terminar.");
