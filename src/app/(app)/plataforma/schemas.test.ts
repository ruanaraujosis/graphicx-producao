import { describe, expect, it } from "vitest";
import { editOrganizationSchema, organizationDataSchema } from "./schemas";

describe("dados da gráfica", () => {
  it("o dono altera nome, razão social e CNPJ — o código não faz parte", () => {
    const parsed = organizationDataSchema.parse({
      name: "  Smart Gráfica  ",
      legal_name: "",
      document: "11.222.333/0001-81",
      slug: "outro-codigo",
    });
    expect(parsed).toEqual({ name: "Smart Gráfica", legal_name: null, document: "11222333000181" });
    expect("slug" in parsed).toBe(false);
  });

  it("recusa CNPJ inválido e nome vazio", () => {
    expect(
      organizationDataSchema.safeParse({ name: "Smart", legal_name: "", document: "123" }).success,
    ).toBe(false);
    expect(
      organizationDataSchema.safeParse({ name: " ", legal_name: "", document: "" }).success,
    ).toBe(false);
  });

  it("a plataforma também altera o código, no formato certo", () => {
    expect(
      editOrganizationSchema.parse({
        name: "Smart",
        slug: "Smart-Centro",
        legal_name: "",
        document: "",
      }).slug,
    ).toBe("smart-centro");
    expect(
      editOrganizationSchema.safeParse({
        name: "Smart",
        slug: "smart centro",
        legal_name: "",
        document: "",
      }).success,
    ).toBe(false);
  });
});
