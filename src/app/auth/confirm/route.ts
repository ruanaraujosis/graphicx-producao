import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { recordAccess } from "@/lib/auth/access-log";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino dos links enviados por e-mail (recuperação de senha).
 * Aceita o fluxo PKCE (`code`) e o de template customizado (`token_hash` + `type`).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let userId: string | undefined;

  if (code) {
    userId = (await supabase.auth.exchangeCodeForSession(code)).data.user?.id;
  } else if (tokenHash && type) {
    userId = (await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).data.user?.id;
  }
  const ok = Boolean(userId);
  if (userId) await recordAccess(userId, "link");

  const target = new URL(ok ? next : "/login?erro=link-invalido", request.url);
  return NextResponse.redirect(target);
}
