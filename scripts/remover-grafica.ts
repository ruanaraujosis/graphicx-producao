/**
 * Remove uma gráfica (tenant) e os vínculos dela. Uso só pelo dono da plataforma.
 *
 *   npm run plataforma:remover-grafica -- <codigo>              → simulação (não apaga nada)
 *   npm run plataforma:remover-grafica -- <codigo> --confirmar  → apaga de verdade
 *
 * As contas das pessoas NÃO são apagadas (elas podem estar em outras gráficas);
 * o script lista quem ficou sem nenhuma gráfica. O histórico de auditoria é mantido.
 */
import { createClient } from "@supabase/supabase-js";
import { slugSchema } from "../src/lib/auth/organization";
import type { Database } from "../src/lib/supabase/database.types";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✖ Variável ${name} não definida.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const [rawSlug] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const confirm = process.argv.includes("--confirmar");
  if (!rawSlug) {
    console.error("Uso: npm run plataforma:remover-grafica -- <codigo> [--confirmar]");
    process.exit(1);
  }
  const slug = slugSchema.parse(rawSlug);

  const db = createClient<Database>(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: org } = await db
    .from("organizations")
    .select("id, name, slug, active, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) {
    console.error(`✖ Nenhuma gráfica com o código "${slug}".`);
    process.exit(1);
  }

  const { data: members } = await db
    .from("organization_members")
    .select("user_id, profiles(username, full_name), organization_roles(name)")
    .eq("organization_id", org.id);

  console.log(`Gráfica: ${org.name} (${org.slug}) — ${org.active ? "ativa" : "desativada"}`);
  console.log(`Vínculos que serão removidos: ${members?.length ?? 0}`);
  for (const m of members ?? []) {
    console.log(
      `  • ${m.profiles?.username ?? m.user_id} — ${m.profiles?.full_name ?? ""} (${m.organization_roles?.name ?? "sem perfil"})`,
    );
  }

  if (!confirm) {
    console.log("\nSimulação: nada foi apagado. Para remover, rode de novo com --confirmar.");
    return;
  }

  const { error } = await db.from("organizations").delete().eq("id", org.id);
  if (error) throw error;
  console.log(
    `\n✔ Gráfica "${org.name}" removida (vínculos apagados em cascata; auditoria mantida).`,
  );

  // Quem ficou sem nenhuma gráfica e não é SuperAdmin cai na tela "sem acesso".
  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length) {
    const [{ data: still }, { data: platform }] = await Promise.all([
      db.from("organization_members").select("user_id").in("user_id", userIds),
      db.from("platform_admins").select("user_id").in("user_id", userIds),
    ]);
    const keep = new Set([...(still ?? []), ...(platform ?? [])].map((r) => r.user_id));
    const orphans = (members ?? []).filter((m) => !keep.has(m.user_id));
    if (orphans.length) {
      console.log("Pessoas que ficaram sem nenhuma gráfica (a conta continua existindo):");
      for (const m of orphans) console.log(`  • ${m.profiles?.username ?? m.user_id}`);
    }
  }
}

main().catch((error) => {
  console.error("✖ Não foi possível remover a gráfica:", error?.message ?? error);
  process.exit(1);
});
