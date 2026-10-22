"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./dal";
import { ACTIVE_ORG_COOKIE } from "./organization";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
  redirect("/login");
}

/** Define a gráfica ativa neste aparelho. Só aceita gráficas das quais a pessoa é membro. */
export async function selectOrganization(organizationId: string) {
  const session = await requireUser();
  const id = z.uuid().safeParse(organizationId);
  if (!id.success || !session.memberships.some((m) => m.organizationId === id.data)) {
    return { error: "Você não tem acesso a esta gráfica." };
  }

  (await cookies()).set(ACTIVE_ORG_COOKIE, id.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/inicio");
}
