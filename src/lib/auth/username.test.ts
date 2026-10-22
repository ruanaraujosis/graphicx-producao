import { describe, expect, it } from "vitest";
import {
  emailSchema,
  emailToUsername,
  normalizeUsername,
  parseLoginIdentifier,
  passwordSchema,
  usernameSchema,
  usernameToEmail,
} from "./username";

describe("normalizeUsername", () => {
  it("remove acentos, espaços e maiúsculas", () => {
    expect(normalizeUsername("  João.Produção ")).toBe("joao.producao");
  });
});

describe("usernameSchema", () => {
  it.each(["ruan.diretor", "maria.silva.atendimento", "ana2.expedicao"])("aceita %s", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });

  it.each(["ruan", ".diretor", "ruan.", "ruan..diretor", "ruan diretor@x", "ru"])(
    "recusa %s",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );

  it("normaliza antes de validar", () => {
    expect(usernameSchema.parse("Joana.Designer")).toBe("joana.designer");
  });
});

describe("e-mail interno", () => {
  it("é reversível", () => {
    const email = usernameToEmail("Joana.Designer");
    expect(email).toBe("joana.designer@usuarios.smart.local");
    expect(emailToUsername(email)).toBe("joana.designer");
  });

  it("ignora e-mails de fora do domínio interno", () => {
    expect(emailToUsername("alguem@gmail.com")).toBeNull();
  });
});

describe("passwordSchema", () => {
  it("exige pelo menos 8 caracteres", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
  });
});

describe("parseLoginIdentifier", () => {
  it("reconhece e-mail", () => {
    expect(parseLoginIdentifier(" Ruan@Grafica.com ")).toEqual({
      kind: "email",
      value: "ruan@grafica.com",
    });
  });
  it("reconhece usuário e normaliza", () => {
    expect(parseLoginIdentifier("João.Produção")).toEqual({
      kind: "username",
      value: "joao.producao",
    });
  });
});

describe("emailSchema", () => {
  it("recusa o domínio interno", () => {
    expect(emailSchema.safeParse("x.y@usuarios.smart.local").success).toBe(false);
  });
  it("normaliza para minúsculas", () => {
    expect(emailSchema.parse(" Ana@Grafica.COM ")).toBe("ana@grafica.com");
  });
});
