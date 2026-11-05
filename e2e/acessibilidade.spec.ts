import { expect, test, type Page } from "@playwright/test";

/**
 * Auditoria automática de acessibilidade (axe-core, WCAG 2.1 A e AA) nas páginas públicas,
 * nos temas claro e escuro. Telas logadas: conferidas no navegador durante o desenvolvimento.
 */
const AXE = require.resolve("axe-core/axe.min.js");

const PAGES = [
  { path: "/login", name: "login" },
  { path: "/esqueci-senha", name: "esqueci a senha" },
  { path: "/privacidade", name: "política de privacidade" },
  { path: "/termos", name: "termos de uso" },
  { path: "/tv", name: "conectar TV" },
  // Consulta o banco (no CI, o Supabase local do job de E2E).
  { path: "/a/00000000000000000000000000000000", name: "link de arte inválido" },
];

type Violation = { id: string; impact: string; help: string; nodes: { target: string[] }[] };

async function audit(page: Page) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as { axe: { run: (o: object) => Promise<{ violations: Violation[] }> } }
    ).axe.run({ runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
    return result.violations;
  });
  return violations.map(
    (v) =>
      `${v.impact} · ${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`acessibilidade (${scheme === "light" ? "tema claro" : "tema escuro"})`, () => {
    test.use({ colorScheme: scheme });
    for (const { path, name } of PAGES) {
      test(`${name} sem violações WCAG A/AA`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}
