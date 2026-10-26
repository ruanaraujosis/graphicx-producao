/** Só aceita caminhos internos para o redirecionamento pós-login (evita open redirect). */
export function safeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/inicio";
  }
  if (next === "/login" || next.startsWith("/login?")) return "/inicio";
  return next;
}
