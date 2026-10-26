/**
 * Prepara a plataforma: cria (ou reaproveita) a primeira gráfica e a pessoa que
 * será SuperAdmin da plataforma e admin dessa gráfica.
 *
 * Uso:  npm run plataforma:iniciar
 * Lê do .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, ORG_NAME, ORG_SLUG,
 * ADMIN_FULL_NAME, ADMIN_USERNAME, ADMIN_EMAIL (opcional) e ADMIN_PASSWORD.
 * Pode rodar de novo sem duplicar nada. Depois, apague ADMIN_PASSWORD do .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { slugSchema } from "../src/lib/auth/organization";
import {
  emailSchema,
  passwordSchema,
  usernameSchema,
  usernameToEmail,
} from "../src/lib/auth/username";
import type { Database } from "../src/lib/supabase/database.types";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✖ Defina ${name} no .env.local.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = required("SUPABASE_SECRET_KEY");
  const orgName = required("ORG_NAME");
  const orgSlug = slugSchema.parse(required("ORG_SLUG"));
  const fullName = required("ADMIN_FULL_NAME");
  const username = usernameSchema.parse(required("ADMIN_USERNAME"));
  const rawEmail = process.env.ADMIN_EMAIL?.trim();
  const email = rawEmail ? emailSchema.parse(rawEmail) : undefined;
  const password = passwordSchema.parse(required("ADMIN_PASSWORD"));

  const db = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Gráfica
  let { data: org } = await db.from("organizations").select("id").eq("slug", orgSlug).maybeSingle();
  if (!org) {
    const created = await db
      .from("organizations")
      .insert({ name: orgName, slug: orgSlug })
      .select("id")
      .single();
    if (created.error) throw created.error;
    org = created.data;
    console.log(`✔ Gráfica "${orgName}" (${orgSlug}) criada.`);
  } else {
    console.log(`• Gráfica "${orgSlug}" já existia.`);
  }

  // 2. Pessoa
  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  let userId = existing?.id;

  if (userId) {
    const { error } = await db.auth.admin.updateUserById(userId, {
      password,
      ban_duration: "none",
    });
    if (error) throw error;
    console.log(`• Pessoa "${username}" já existia; senha atualizada.`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: email ?? usernameToEmail(username),
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("Falha ao criar a conta no Auth.");
    userId = data.user.id;
    const profile = await db
      .from("profiles")
      .insert({ id: userId, username, full_name: fullName, email: email ?? null });
    // Quem roda este script define a própria senha: não é provisória.
    if (profile.error) {
      await db.auth.admin.deleteUser(userId);
      throw profile.error;
    }
    console.log(`✔ Pessoa "${username}" criada.`);
  }

  // 3. Admin da gráfica + SuperAdmin da plataforma
  const { data: adminRole, error: roleError } = await db
    .from("organization_roles")
    .select("id")
    .eq("organization_id", org.id)
    .eq("is_admin", true)
    .single();
  if (roleError || !adminRole) throw roleError ?? new Error("Perfil Administrador não encontrado.");
  const member = await db
    .from("organization_members")
    .upsert({ organization_id: org.id, user_id: userId, role_id: adminRole.id, active: true });
  if (member.error) throw member.error;
  const platform = await db.from("platform_admins").upsert({ user_id: userId });
  if (platform.error) throw platform.error;

  console.log(`✔ "${username}" é admin de ${orgName} e SuperAdmin da plataforma.`);
  console.log("  No primeiro login o sistema vai pedir para configurar o app autenticador (MFA).");
  console.log("  Agora apague ADMIN_PASSWORD do .env.local.");
}

main().catch((error) => {
  console.error("✖ Não foi possível iniciar a plataforma:", error?.message ?? error);
  process.exit(1);
});
