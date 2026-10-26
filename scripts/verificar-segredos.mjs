#!/usr/bin/env node
/**
 * Procura credenciais em arquivos que vão para o Git. O repositório é PÚBLICO.
 *
 *   node scripts/verificar-segredos.mjs --staged   → só o que está no commit (pre-commit)
 *   node scripts/verificar-segredos.mjs            → todos os arquivos versionados (CI)
 *
 * Nunca imprime o segredo encontrado: só arquivo, linha, tipo e os 4 primeiros caracteres.
 * Falso positivo? Adicione o comentário `segredo-ok` na mesma linha.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const staged = process.argv.includes("--staged");

const PATTERNS = [
  ["Chave secreta do Supabase", /sb_secret_[A-Za-z0-9_-]{16,}/],
  [
    "JWT (ex.: service_role antiga do Supabase)",
    /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  ],
  ["Chave privada", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ["Token do GitHub", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["Chave da Anthropic", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["Chave da OpenAI", /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/],
  ["Chave da AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["Senha do Postgres em URL", /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]{6,}@/],
];

// Atribuições com valor em arquivos de configuração (KEY=valor, key: valor).
const ASSIGNMENT =
  /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PARTNER_KEY|API_KEY|ENCRYPTION_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*[=:]\s*["']?([^\s"'#,}]{8,})/;
const CONFIG_FILE = /(^|\/)\.env[^/]*$|\.(?:ya?ml|toml|ini|cfg|conf|properties|json)$/i;
const PLACEHOLDER =
  /^(?:\$\{\{.*|\$\{?[A-Z_]+\}?|<[^>]+>|x{4,}|\*{4,}|changeme|example|placeholder|seu[-_].*|preencher.*)$/i;

// Arquivos que nunca devem ir para o Git.
const FORBIDDEN_FILES = [
  [/(^|\/)\.env(?!\.example$)(\.[\w-]+)*$/, "arquivo .env (só o .env.example pode ir para o Git)"],
  [/\.(?:pem|pfx|p12|key)$/i, "certificado ou chave privada"],
  [/\.(?:dump|sql\.gz)$/i, "dump de banco de dados"],
];

const SKIP =
  /(^|\/)(?:node_modules|\.next|package-lock\.json$)|\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip)$/i;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const files = (
  staged ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]) : git(["ls-files"])
)
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean);

function contentOf(file) {
  try {
    return staged ? git(["show", `:${file}`]) : readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

const findings = [];
for (const file of files) {
  const forbidden = FORBIDDEN_FILES.find(([pattern]) => pattern.test(file));
  if (forbidden) {
    findings.push(`${file}: ${forbidden[1]}`);
    continue;
  }
  if (SKIP.test(file)) continue;

  const lines = contentOf(file).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes("segredo-ok")) return;
    for (const [label, pattern] of PATTERNS) {
      const match = line.match(pattern);
      if (match) findings.push(`${file}:${index + 1}: ${label} (${match[0].slice(0, 4)}…)`);
    }
    if (CONFIG_FILE.test(file)) {
      const match = line.match(ASSIGNMENT);
      if (match && !PLACEHOLDER.test(match[2])) {
        findings.push(
          `${file}:${index + 1}: valor preenchido em ${match[1]} (${match[2].slice(0, 4)}…)`,
        );
      }
    }
  });
}

if (findings.length) {
  console.error("✖ Possíveis credenciais encontradas — o repositório é público:\n");
  for (const finding of findings) console.error(`  • ${finding}`);
  console.error(
    "\nRemova o valor (use variáveis de ambiente) e, se ele já saiu do seu computador, TROQUE a credencial.",
  );
  console.error("Falso positivo? Adicione o comentário `segredo-ok` na linha.");
  process.exit(1);
}
console.log(`✔ Nenhuma credencial encontrada em ${files.length} arquivo(s).`);
