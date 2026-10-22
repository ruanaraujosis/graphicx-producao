#!/usr/bin/env node
/**
 * Hook PreToolUse: impede que o Claude leia ou exiba credenciais.
 *
 * Bloqueia:
 *  - qualquer acesso direto a arquivos .env (exceto .env.example), por shell ou
 *    pelas ferramentas de arquivo (Read, Edit, Write, Grep, Glob, NotebookEdit);
 *  - comandos que expandem variáveis de segredo ($SUPABASE_SECRET_KEY, $env:..._TOKEN);
 *  - comandos que despejam o ambiente inteiro (printenv, env, Get-ChildItem env:).
 *
 * O caminho seguro é `npm run env:verificar`, que confere as variáveis sem mostrar valores.
 * Regras completas: .claude/skills/segredos/SKILL.md
 */

const SAFE_ENV_FILES = new Set([".env.example"]);

// Arquivo .env, .env.local, .env.production... como palavra isolada num caminho ou comando.
const ENV_FILE = /(?:^|[\s"'`=/\\<>|;&(,:])(\.env(?:\.[\w-]+)*)(?=$|[\s"'`/\\<>|;&),:*?])/g;

const SECRET_NAME = String.raw`[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PARTNER_KEY|API_KEY|ENCRYPTION_KEY|PRIVATE_KEY|SERVICE_ROLE)[A-Z0-9_]*`;
const SECRET_EXPANSION = new RegExp(
  String.raw`(?:\$\{?${SECRET_NAME}\b|\$env:${SECRET_NAME}\b|process\.env\.${SECRET_NAME}\b|process\.env\[["']${SECRET_NAME}["']\])`,
  "i",
);

const ENV_DUMP = [
  /(?:^|[\s;&|(])printenv\b/,
  /(?:^|[\s;&|(])env\s*(?:$|[|;&>])/,
  /(?:^|[\s;&|(])(?:Get-ChildItem|gci|ls|dir|Get-Item|gi)\s+env:/i,
  /\[Environment\]::GetEnvironmentVariables/i,
  /(?:^|[\s;&|(])export\s+-p\b/,
  /(?:^|[\s;&|(])(?:set|declare\s+-x)\s*(?:$|[|;&>])/,
];

function blockedEnvFiles(text) {
  if (!text) return [];
  const found = [];
  for (const match of String(text).matchAll(ENV_FILE)) {
    const name = match[1];
    if (!SAFE_ENV_FILES.has(name)) found.push(name);
  }
  return found;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `🔒 Bloqueado para proteger credenciais: ${reason} Use \`npm run env:verificar\` (confere sem mostrar valores) ou peça para a pessoa editar o arquivo. Veja .claude/skills/segredos/SKILL.md.`,
      },
    }),
  );
  process.exit(0);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }

  const tool = payload.tool_name ?? "";
  const input = payload.tool_input ?? {};

  if (tool === "Bash" || tool === "PowerShell") {
    const command = String(input.command ?? "");
    const files = blockedEnvFiles(command);
    if (files.length) deny(`o comando acessa ${[...new Set(files)].join(", ")} diretamente.`);
    if (SECRET_EXPANSION.test(command)) deny("o comando expande uma variável de segredo.");
    if (ENV_DUMP.some((pattern) => pattern.test(command))) {
      deny("o comando despeja as variáveis de ambiente.");
    }
    process.exit(0);
  }

  // Ferramentas de arquivo: confere todos os campos que apontam para caminhos.
  const targets = [input.file_path, input.notebook_path, input.path, input.glob, input.pattern]
    .filter(Boolean)
    .map(String);
  const files = targets.flatMap(blockedEnvFiles);
  if (files.length) deny(`a ferramenta ${tool} tentou acessar ${[...new Set(files)].join(", ")}.`);

  process.exit(0);
});
