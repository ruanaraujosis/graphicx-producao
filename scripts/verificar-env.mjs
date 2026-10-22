#!/usr/bin/env node
/**
 * Confere o .env.local SEM exibir nenhum valor secreto.
 *
 *   npm run env:verificar             → preenchimento e formato de cada variável
 *   npm run env:verificar -- --conexao → também testa as chaves contra o Supabase
 *   npm run env:verificar -- --producao → confere o arquivo de produção (.env.producao.local)
 *
 * Mostra só: ✔/✖/⚠, o tipo da chave e o tamanho. Valores públicos (URLs) aparecem inteiros.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PRODUCTION = process.argv.includes("--producao");
const FILE = resolve(process.cwd(), ".env" + (PRODUCTION ? ".producao.local" : ".local"));

/** Regras por variável. `public: true` = pode ser exibida (já vai para o navegador). */
const RULES = {
  NEXT_PUBLIC_SUPABASE_URL: {
    required: true,
    public: true,
    format: /^https:\/\/[a-z0-9]{20}\.supabase\.co$/,
  },
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: { required: true, format: /^sb_publishable_[\w-]{10,}$/ },
  SUPABASE_SECRET_KEY: { required: true, format: /^sb_secret_[\w-]{10,}$/ },
  NEXT_PUBLIC_APP_URL: { required: true, public: true, format: /^https?:\/\/\S+$/ },
  ORG_NAME: { public: true },
  ORG_SLUG: { public: true },
  ADMIN_FULL_NAME: { public: true },
  ADMIN_USERNAME: { public: true },
  ADMIN_EMAIL: { public: true },
  ADMIN_PASSWORD: { mustBeEmptyAfterSetup: true },
};

function parse(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    vars[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2").trim();
  }
  return vars;
}

function describe(name, value) {
  const rule = RULES[name] ?? {};
  if (!value) {
    return rule.required
      ? { icon: "✖", text: "vazia (obrigatória)", bad: true }
      : { icon: "·", text: "vazia" };
  }
  if (rule.mustBeEmptyAfterSetup) {
    return { icon: "⚠", text: `preenchida (${value.length} caracteres) — apague depois de usar` };
  }
  if (/PREENCHER|SEU-PROJETO/i.test(value)) {
    return { icon: "✖", text: "ainda com o valor de exemplo", bad: true };
  }
  const shown = rule.public
    ? value
    : `${value.match(/^(sb_\w+?_|eyJ)/)?.[0] ?? ""}… (${value.length} caracteres)`;
  if (rule.format && !rule.format.test(value)) {
    return { icon: "⚠", text: `formato inesperado: ${shown}`, bad: true };
  }
  return { icon: "✔", text: shown };
}

async function testConnection(vars) {
  const url = vars.NEXT_PUBLIC_SUPABASE_URL;
  let failures = 0;
  const check = async (label, path, key, extraHeaders = {}) => {
    try {
      const res = await fetch(`${url}${path}`, { headers: { apikey: key, ...extraHeaders } });
      const ok = res.ok;
      if (!ok) failures++;
      console.log(`  ${ok ? "✔" : "✖"} ${label}: HTTP ${res.status}`);
      return ok ? res : null;
    } catch (error) {
      failures++;
      console.log(`  ✖ ${label}: ${error.cause?.code ?? error.message}`);
      return null;
    }
  };

  console.log("\nConexão com o Supabase:");
  const settings = await check(
    "chave pública",
    "/auth/v1/settings",
    vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  await check("chave secreta", "/auth/v1/admin/users?per_page=1", vars.SUPABASE_SECRET_KEY, {
    Authorization: `Bearer ${vars.SUPABASE_SECRET_KEY}`,
  });
  if (settings) {
    const body = await settings.json();
    console.log(
      body.disable_signup
        ? "  ✔ cadastro público desligado"
        : "  ⚠ cadastro público LIGADO — desligue em Authentication → Sign In / Providers",
    );
  }
  for (const table of [
    "organizations",
    "organization_members",
    "organization_roles",
    "platform_admins",
  ]) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
      headers: { apikey: vars.SUPABASE_SECRET_KEY },
    }).catch(() => null);
    if (!res?.ok) failures++;
    console.log(
      `  ${res?.ok ? "✔" : "✖"} tabela ${table}${res?.ok ? "" : " (rode `npx supabase db push`)"}`,
    );
  }

  // Isolamento: sem login, nenhuma tabela pode ser lida (RLS + revoke para anon).
  for (const table of ["organizations", "profiles", "organization_members", "audit_log"]) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    }).catch(() => null);
    const blocked = res && (res.status === 401 || res.status === 403);
    if (!blocked) failures++;
    console.log(
      `  ${blocked ? "✔" : "✖"} sem login não lê ${table}${blocked ? "" : ` (HTTP ${res?.status ?? "erro"} — revise o RLS!)`}`,
    );
  }
  return failures;
}

if (!existsSync(FILE)) {
  console.error("✖ Arquivo .env.local não encontrado. Copie o .env.example e preencha.");
  process.exit(1);
}

const vars = parse(readFileSync(FILE, "utf8"));
console.log("Variáveis do .env.local (valores secretos nunca são exibidos):\n");
let problems = 0;
for (const name of Object.keys(RULES)) {
  const result = describe(name, vars[name]);
  if (result.bad) problems++;
  console.log(`  ${result.icon} ${name.padEnd(38)} ${result.text}`);
}

if (process.argv.includes("--conexao") && !problems) problems += await testConnection(vars);
console.log(problems ? `\n${problems} problema(s) para corrigir.` : "\nTudo certo.");
process.exit(problems ? 1 : 0);
