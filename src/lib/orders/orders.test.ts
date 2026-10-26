import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandPermissions, type Permission } from "@/lib/auth/permissions";
import { addBusinessDays, dueRisk, formatDueDate, todayIso } from "./deadline";
import {
  BOARD_STATUSES,
  ORDER_STATUSES,
  canSetStatus,
  itemTargetState,
  nextStatus,
  type OrderStatus,
} from "./status";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261011000000_pedidos_pcp_artes.sql"),
  "utf8",
);

const perms = (...p: string[]) => expandPermissions(p) as Permission[];

describe("status do pedido", () => {
  it("tem a mesma lista e ordem do enum do banco", () => {
    const body = migration.match(/create type public\.order_status as enum \(([\s\S]*?)\);/)?.[1];
    const values = [...(body ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...ORDER_STATUSES]);
  });

  it("o quadro não mostra orçamento nem cancelado", () => {
    expect(BOARD_STATUSES).not.toContain("orcamento");
    expect(BOARD_STATUSES).not.toContain("cancelado");
    expect(BOARD_STATUSES[0]).toBe("novo");
  });

  it("avança pelo caminho natural, pulando a arte quando não precisa", () => {
    expect(nextStatus("novo", true)).toBe("aguardando_arte");
    expect(nextStatus("novo", false)).toBe("em_impressao");
    expect(nextStatus("aprovado", true)).toBe("em_impressao");
    expect(nextStatus("entregue", true)).toBeNull();
    expect(nextStatus("cancelado", true)).toBeNull();
  });
});

describe("estoque do item conforme o status (igual a private.order_item_target_state)", () => {
  const cases: [OrderStatus, "sob_encomenda" | "pronta_entrega", string][] = [
    ["orcamento", "sob_encomenda", "livre"],
    ["novo", "sob_encomenda", "reservado"],
    ["aprovado", "sob_encomenda", "reservado"],
    ["em_impressao", "sob_encomenda", "baixado"],
    ["entregue", "sob_encomenda", "baixado"],
    ["em_impressao", "pronta_entrega", "reservado"],
    ["expedicao", "pronta_entrega", "reservado"],
    ["enviado", "pronta_entrega", "baixado"],
    ["cancelado", "pronta_entrega", "livre"],
  ];
  it.each(cases)("%s / %s → %s", (status, mode, expected) => {
    expect(itemTargetState(status, mode)).toBe(expected);
  });

  it("o SQL usa os mesmos marcos (em_impressao e enviado)", () => {
    const fn = migration.match(
      /function private\.order_item_target_state[\s\S]*?\$\$([\s\S]*?)\$\$/,
    )?.[1];
    expect(fn).toContain("p_status in ('orcamento', 'cancelado') then 'livre'");
    expect(fn).toContain("p_status < 'em_impressao' then 'reservado'");
    expect(fn).toContain(
      "p_fulfillment = 'pronta_entrega' and p_status < 'enviado' then 'reservado'",
    );
  });
});

describe("quem muda o status (igual a private.can_set_order_status)", () => {
  const atendimento = perms("pedidos.gerenciar");
  const designer = perms("artes.gerenciar", "pedidos.ver");
  const producao = perms("pcp.gerenciar", "pedidos.ver");
  const expedicao = perms("expedicao.gerenciar");
  const leitura = perms("pedidos.ver", "pcp.ver");

  it("pedidos.gerenciar pode tudo, inclusive cancelar e reabrir orçamento", () => {
    expect(canSetStatus(atendimento, "novo", "cancelado")).toBe(true);
    expect(canSetStatus(atendimento, "orcamento", "novo")).toBe(true);
    expect(canSetStatus(atendimento, "entregue", "em_impressao")).toBe(true);
  });

  it("designer só nas etapas de arte", () => {
    expect(canSetStatus(designer, "aguardando_arte", "arte_em_criacao")).toBe(true);
    expect(canSetStatus(designer, "aguardando_aprovacao", "aprovado")).toBe(true);
    expect(canSetStatus(designer, "aprovado", "em_impressao")).toBe(false);
    expect(canSetStatus(designer, "novo", "cancelado")).toBe(false);
  });

  it("produção de Novo até Expedição", () => {
    expect(canSetStatus(producao, "aprovado", "em_impressao")).toBe(true);
    expect(canSetStatus(producao, "acabamento", "expedicao")).toBe(true);
    expect(canSetStatus(producao, "expedicao", "enviado")).toBe(false);
    expect(canSetStatus(producao, "orcamento", "novo")).toBe(false);
  });

  it("expedição de Expedição até Entregue", () => {
    expect(canSetStatus(expedicao, "expedicao", "enviado")).toBe(true);
    expect(canSetStatus(expedicao, "enviado", "entregue")).toBe(true);
    expect(canSetStatus(expedicao, "acabamento", "expedicao")).toBe(false);
  });

  it("só leitura não move nada; mesmo status não conta", () => {
    expect(canSetStatus(leitura, "novo", "aguardando_arte")).toBe(false);
    expect(canSetStatus(atendimento, "novo", "novo")).toBe(false);
  });

  it("o SQL usa as mesmas faixas", () => {
    const fn = migration.match(
      /function private\.can_set_order_status[\s\S]*?\$\$([\s\S]*?)\$\$/,
    )?.[1];
    expect(fn).toContain("'artes.gerenciar')\n          and p_from between 'novo' and 'aprovado'");
    expect(fn).toContain("'pcp.gerenciar')\n          and p_from between 'novo' and 'expedicao'");
    expect(fn).toContain(
      "'expedicao.gerenciar')\n          and p_from between 'expedicao' and 'entregue'",
    );
  });
});

describe("prazos", () => {
  it("hoje em São Paulo", () => {
    // 02:00 UTC de 09/10 ainda é 08/10 em São Paulo.
    expect(todayIso(new Date("2026-10-09T02:00:00Z"))).toBe("2026-10-08");
  });

  it("soma dias úteis pulando o fim de semana", () => {
    expect(addBusinessDays("2026-10-08", 2)).toBe("2026-10-12"); // qui + 2 úteis = seg
    expect(addBusinessDays("2026-10-09", 1)).toBe("2026-10-12"); // sex + 1 = seg
    expect(addBusinessDays("2026-10-08", 0)).toBe("2026-10-08");
  });

  it("classifica o risco do prazo", () => {
    expect(dueRisk("2026-10-07", "2026-10-08")).toBe("atrasado");
    expect(dueRisk("2026-10-08", "2026-10-08")).toBe("hoje");
    expect(dueRisk("2026-10-09", "2026-10-08")).toBe("amanha");
    expect(dueRisk("2026-10-20", "2026-10-08")).toBe("ok");
    expect(dueRisk(null, "2026-10-08")).toBeNull();
  });

  it("formata a data sem fuso", () => {
    expect(formatDueDate("2026-10-08")).toBe("08/10/2026");
  });
});
