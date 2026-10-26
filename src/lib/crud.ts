import "server-only";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/dal";
import type { Permission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type ActionResult<T = undefined> =
  | ({ ok: true; message: string } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

export type OrgTable = keyof Database["public"]["Tables"];

/** Traduz erros do Postgres para mensagens que a equipe entende. */
export function dbErrorMessage(
  error: { code?: string; message: string },
  messages: { unique?: string; inUse?: string; fallback: string },
) {
  if (error.code === "23505") return messages.unique ?? "Já existe um registro com esses dados.";
  if (error.code === "23503")
    return messages.inUse ?? "Este registro está em uso e não pode ser removido.";
  // Regras do banco (permissões, escalada, gatilhos) já respondem em português.
  if (["42501", "P0001", "P0002", "22023"].includes(error.code ?? "")) {
    // Exceto a recusa genérica de privilégio do Postgres (em inglês).
    return /permission denied/i.test(error.message)
      ? "Você não tem permissão para esta ação."
      : error.message;
  }
  if (error.code === "23514") {
    // Restrição automática (CHECK) vem em inglês; as dos gatilhos já vêm em português.
    return /violates check constraint/i.test(error.message)
      ? "Algum campo está com um valor inválido."
      : error.message;
  }
  return messages.fallback;
}

/**
 * Cria ou atualiza um registro da gráfica ativa. A autorização é dupla:
 * `requireOrg(permission)` na aplicação e o RLS no banco.
 */
export async function saveOrgRecord(opts: {
  table: OrgTable;
  permission: Permission;
  id?: string;
  values: Record<string, unknown>;
  revalidate: string | string[];
  messages: { created: string; updated: string; unique?: string; fallback: string };
}): Promise<ActionResult<{ id: string }>> {
  const { membership } = await requireOrg(opts.permission);
  const supabase = await createClient();
  // O tipo exato de cada tabela já foi validado pelo schema Zod de quem chama.
  const table = supabase.from(opts.table) as unknown as {
    insert: (v: unknown) => {
      select: (c: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
    update: (v: unknown) => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (
          c: string,
          v: string,
        ) => {
          select: (c: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { code?: string; message: string } | null;
            }>;
          };
        };
      };
    };
  };

  const { data, error } = opts.id
    ? await table
        .update(opts.values)
        .eq("id", opts.id)
        .eq("organization_id", membership.organizationId)
        .select("id")
        .single()
    : await table
        .insert({ ...opts.values, organization_id: membership.organizationId })
        .select("id")
        .single();

  if (error || !data) {
    return {
      ok: false,
      error: error
        ? dbErrorMessage(error, { unique: opts.messages.unique, fallback: opts.messages.fallback })
        : opts.messages.fallback,
    };
  }

  for (const path of [opts.revalidate].flat()) revalidatePath(path);
  return {
    ok: true,
    message: opts.id ? opts.messages.updated : opts.messages.created,
    data: { id: data.id },
  };
}
