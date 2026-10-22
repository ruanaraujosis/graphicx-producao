import { describe, expect, it } from "vitest";
import { addressLines, labelData } from "./data";
import {
  BUILTIN_TEMPLATES,
  createElement,
  fillText,
  LABEL_FIELDS,
  labelTemplateSchema,
  SAMPLE_DATA,
} from "./template";

describe("modelos de etiqueta", () => {
  it("troca os campos e mantém os desconhecidos", () => {
    expect(fillText("Pedido {pedido.numero} para {cliente.nome} {x.y}", SAMPLE_DATA)).toBe(
      "Pedido #1042 para Maria Souza {x.y}",
    );
  });

  it("linha com campos vazios some", () => {
    expect(
      fillText("Tel. {cliente.telefone}\nRastreio {pedido.rastreio}", {
        "cliente.telefone": "",
        "pedido.rastreio": "BR1",
      }),
    ).toBe("Rastreio BR1");
  });

  it("modelos embutidos passam na validação e usam só campos conhecidos", () => {
    const keys = new Set<string>(LABEL_FIELDS.map((f) => f.key));
    for (const t of Object.values(BUILTIN_TEMPLATES)) {
      expect(labelTemplateSchema.safeParse(t).success).toBe(true);
      for (const el of t.elements) {
        expect(el.x + el.w).toBeLessThanOrEqual(t.width_mm);
        expect(el.y + el.h).toBeLessThanOrEqual(t.height_mm);
        if (el.type === "text")
          for (const [, key] of el.text.matchAll(/\{([a-z_.]+)\}/g))
            expect(keys.has(key)).toBe(true);
      }
    }
  });

  it("elemento novo nasce dentro da etiqueta", () => {
    for (const type of ["text", "qr", "image", "box", "line"] as const) {
      const el = createElement(type, 60, 40);
      expect(el.x + el.w).toBeLessThanOrEqual(60);
      expect(el.y + el.h).toBeLessThanOrEqual(40);
    }
  });

  it("recusa tamanho fora dos limites", () => {
    const base = { name: "Teste", elements: [], background_path: null };
    expect(labelTemplateSchema.safeParse({ ...base, width_mm: 10, height_mm: 50 }).success).toBe(
      false,
    );
    expect(labelTemplateSchema.safeParse({ ...base, width_mm: 100, height_mm: 400 }).success).toBe(
      false,
    );
  });

  it("monta os dados do pedido, do cliente e da gráfica", () => {
    const d = labelData({
      order: {
        number: 1001,
        channel: "whatsapp",
        customer_name: "Ana",
        customer_phone: "11999990000",
        due_date: "2026-10-20",
        ship_by_at: null,
        external_id: null,
        tracking_code: null,
        notes: null,
        items: [
          { description: "Caneca", quantity: 2 },
          { description: "Chaveiro", quantity: 1 },
        ],
      },
      customer: {
        name: "Ana Lima",
        legal_name: null,
        document: "12345678909",
        phone: null,
        whatsapp: "11988887777",
        street: "Rua A",
        number: "10",
        complement: "Ap 2",
        district: "Centro",
        city: "Campinas",
        state: "SP",
        cep: "13000000",
      },
      org: { name: "Smart", legal_name: null, document: null, phone: null },
    });
    expect(d["pedido.numero"]).toBe("#1001");
    expect(d["pedido.prazo"]).toBe("20/10/2026");
    expect(d["pedido.itens"]).toBe("2 × Caneca\n1 × Chaveiro");
    expect(d["pedido.qtd_itens"]).toBe("3");
    expect(d["cliente.nome"]).toBe("Ana Lima");
    expect(d["cliente.endereco"]).toBe("Rua A, 10 – Ap 2\nCentro\nCampinas/SP\nCEP 13000-000");
    expect(d["grafica.endereco"]).toBe("");
  });

  it("endereço vazio não quebra", () => {
    expect(addressLines(null)).toBe("");
    expect(addressLines({ city: "Recife", state: "PE" })).toBe("Recife/PE");
  });
});
