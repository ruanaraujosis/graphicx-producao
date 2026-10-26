"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { backupOrganization } from "@/lib/backups/organization-backup";

type Result = { ok: true; message: string } | { ok: false; error: string };

/** Backup manual de uma gráfica, pelo SuperAdmin (só metadados voltam para a tela). */
export async function runOrganizationBackup(organizationId: string): Promise<Result> {
  const session = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return { ok: false, error: "Gráfica inválida." };
  try {
    const { size } = await backupOrganization(organizationId, "manual", session.id);
    revalidatePath("/plataforma/backups");
    return { ok: true, message: `Backup feito (${(size / 1024).toFixed(0)} KB).` };
  } catch (e) {
    revalidatePath("/plataforma/backups");
    return {
      ok: false,
      error: `Não foi possível fazer o backup: ${e instanceof Error ? e.message : "erro"}`,
    };
  }
}
