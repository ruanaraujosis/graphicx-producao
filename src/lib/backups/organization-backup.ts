import "server-only";
import { gzipSync } from "node:zlib";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Backup por gráfica: todas as linhas das tabelas com organization_id daquela
 * gráfica, num JSON compactado (gzip) no bucket privado "backups".
 * Só o servidor chama (rotina com segredo ou SuperAdmin já autorizado).
 */

export const BACKUP_BUCKET = "backups";
/** Backups automáticos guardados por gráfica (os manuais ficam até alguém apagar). */
export const KEEP_AUTOMATIC = 14;
/** Fora do backup: filas e registros técnicos que se refazem sozinhos. */
export const SKIPPED_TABLES = new Set(["marketplace_jobs", "marketplace_logs", "platform_backups"]);
const PAGE = 1000;

export type BackupFile = {
  format: "graphicx-backup";
  version: 1;
  generated_at: string;
  organization: Record<string, unknown>;
  members: { user_id: string; username: string | null; full_name: string | null }[];
  tables: Record<string, Record<string, unknown>[]>;
  notes: string[];
};

type Db = ReturnType<typeof createAdminClient>;

async function readAll(db: Db, table: string, org: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table as never)
      .select("*")
      .eq("organization_id", org)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Monta o conteúdo do backup (sem gravar). */
export async function buildBackup(db: Db, org: string): Promise<BackupFile> {
  const [{ data: organization, error }, { data: tableNames }] = await Promise.all([
    db.from("organizations").select("*").eq("id", org).single(),
    db.rpc("backup_tables"),
  ]);
  if (error || !organization) throw new Error("Gráfica não encontrada.");
  const names = ((tableNames ?? []) as string[]).filter((t) => !SKIPPED_TABLES.has(t));

  const tables: BackupFile["tables"] = {};
  for (const name of names) tables[name] = await readAll(db, name, org);

  const userIds = [...new Set((tables.organization_members ?? []).map((m) => String(m.user_id)))];
  const { data: profiles } = userIds.length
    ? await db.from("profiles").select("id, username, full_name").in("id", userIds)
    : { data: [] };

  return {
    format: "graphicx-backup",
    version: 1,
    generated_at: new Date().toISOString(),
    organization: organization as Record<string, unknown>,
    members: (profiles ?? []).map((p) => ({
      user_id: p.id,
      username: p.username,
      full_name: p.full_name,
    })),
    tables,
    notes: [
      "Arquivos (fotos, artes, etiquetas) continuam no armazenamento, na pasta da gráfica; aqui vão só os caminhos.",
      "Senhas e chaves das lojas (Vault) não entram: após restaurar, as lojas precisam ser conectadas de novo.",
    ],
  };
}

/** Gera, guarda e registra o backup de uma gráfica; aplica a retenção dos automáticos. */
export async function backupOrganization(
  org: string,
  kind: "automatico" | "manual",
  createdBy: string | null = null,
) {
  const db = createAdminClient();
  const { data: orgRow } = await db.from("organizations").select("name").eq("id", org).single();
  const { data: record, error: insertError } = await db
    .from("platform_backups")
    .insert({
      organization_id: org,
      organization_name: orgRow?.name ?? org,
      kind,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (insertError || !record) throw new Error("Não foi possível registrar o backup.");

  try {
    const file = await buildBackup(db, org);
    const bytes = gzipSync(Buffer.from(JSON.stringify(file)));
    const path = `${org}/${file.generated_at.replace(/[:.]/g, "-")}-${kind}.json.gz`;
    const { error: uploadError } = await db.storage
      .from(BACKUP_BUCKET)
      .upload(path, bytes, { contentType: "application/gzip", upsert: false });
    if (uploadError) throw new Error(`Armazenamento: ${uploadError.message}`);

    const counts = Object.fromEntries(
      Object.entries(file.tables).map(([t, rows]) => [t, rows.length]),
    );
    await db
      .from("platform_backups")
      .update({
        status: "pronto",
        storage_path: path,
        size_bytes: bytes.length,
        row_counts: counts,
        finished_at: new Date().toISOString(),
      })
      .eq("id", record.id);
    await applyRetention(db, org);
    return { id: record.id, size: bytes.length };
  } catch (e) {
    await db
      .from("platform_backups")
      .update({
        status: "erro",
        error: (e instanceof Error ? e.message : "Erro desconhecido.").slice(0, 1000),
        finished_at: new Date().toISOString(),
      })
      .eq("id", record.id);
    throw e;
  }
}

/** Mantém só os últimos backups automáticos de cada gráfica. */
async function applyRetention(db: Db, org: string) {
  const { data: old } = await db
    .from("platform_backups")
    .select("id, storage_path")
    .eq("organization_id", org)
    .eq("kind", "automatico")
    .eq("status", "pronto")
    .order("created_at", { ascending: false })
    .range(KEEP_AUTOMATIC, KEEP_AUTOMATIC + 100);
  if (!old?.length) return;
  const paths = old.map((b) => b.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length) await db.storage.from(BACKUP_BUCKET).remove(paths);
  await db
    .from("platform_backups")
    .delete()
    .in(
      "id",
      old.map((b) => b.id),
    );
}

/**
 * Rotina diária: backup automático de cada gráfica ativa que ainda não tem um
 * nas últimas 20 h. Para antes do limite de tempo; o resto sai na próxima.
 */
export async function runDailyBackups(budgetMs = 45_000) {
  const started = Date.now();
  const db = createAdminClient();
  const since = new Date(Date.now() - 20 * 3_600_000).toISOString();
  const [{ data: orgs }, { data: recent }] = await Promise.all([
    db.from("organizations").select("id").eq("active", true).order("created_at"),
    db
      .from("platform_backups")
      .select("organization_id")
      .eq("kind", "automatico")
      .eq("status", "pronto")
      .gte("created_at", since),
  ]);
  const done = new Set((recent ?? []).map((r) => r.organization_id));
  const result = { feitos: 0, erros: 0, pendentes: 0 };
  for (const o of orgs ?? []) {
    if (done.has(o.id)) continue;
    if (Date.now() - started > budgetMs) {
      result.pendentes++;
      continue;
    }
    try {
      await backupOrganization(o.id, "automatico");
      result.feitos++;
    } catch {
      result.erros++;
    }
  }
  return result;
}
