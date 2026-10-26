import { expect, test } from "@playwright/test";

test.describe("login", () => {
  test("rota protegida redireciona para o login guardando o destino", async ({ page }) => {
    await page.goto("/configuracoes/usuarios");
    await expect(page).toHaveURL(/\/login\?next=%2Fconfiguracoes%2Fusuarios/);
    await expect(page.getByRole("heading", { name: "Entrar no sistema" })).toBeVisible();
  });

  test("valida os campos antes de enviar", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Informe o e-mail ou usuário.")).toBeVisible();
    await expect(page.getByText("Informe a senha.")).toBeVisible();
  });

  test("campos têm rótulos acessíveis", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("E-mail ou usuário")).toBeVisible();
    await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  });

  test("expõe o manifest do PWA", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.name).toBe("GraphicX");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});

test.describe("recuperação de senha", () => {
  test("link do login abre o formulário e não revela se o e-mail existe", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/esqueci-senha$/);
    await expect(page.getByLabel("E-mail cadastrado")).toBeVisible();
  });

  test("link inválido volta ao login com aviso", async ({ page }) => {
    await page.goto("/auth/confirm?next=/redefinir-senha");
    await expect(page).toHaveURL(/\/login\?erro=link-invalido/);
    await expect(page.getByRole("alert")).toContainText("O link expirou");
  });
});
