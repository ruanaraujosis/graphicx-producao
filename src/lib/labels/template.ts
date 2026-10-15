import { z } from "zod";

/**
 * Modelos de etiqueta: elementos posicionados em milímetros sobre uma folha do
 * tamanho da etiqueta. Textos aceitam campos entre chaves ({cliente.nome}) que
 * são trocados pelos dados do pedido na impressão.
 */

export type LabelKind = "envio" | "identificacao";

export const KIND_LABELS: Record<LabelKind, string> = {
  envio: "Etiqueta de envio",
  identificacao: "Etiqueta de identificação",
};

const box = {
  id: z.string().min(1).max(40),
  x: z.number().min(0).max(297),
  y: z.number().min(0).max(297),
  w: z.number().min(1).max(297),
  h: z.number().min(0.2).max(297),
};

export const labelElementSchema = z.discriminatedUnion("type", [
  z.object({
    ...box,
    type: z.literal("text"),
    text: z.string().max(1000),
    size: z.number().min(5).max(72),
    bold: z.boolean(),
    align: z.enum(["left", "center", "right"]),
    border: z.boolean(),
  }),
  z.object({ ...box, type: z.literal("qr") }),
  z.object({
    ...box,
    type: z.literal("image"),
    path: z.string().max(300).nullable(),
    fit: z.enum(["contain", "cover"]),
  }),
  z.object({ ...box, type: z.literal("box"), radius: z.number().min(0).max(10) }),
  z.object({ ...box, type: z.literal("line") }),
]);

export type LabelElement = z.infer<typeof labelElementSchema>;
export type ElementType = LabelElement["type"];

export const labelTemplateSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao modelo.").max(80, "Máximo de 80 caracteres."),
  width_mm: z.number().min(20, "Largura mínima de 20 mm.").max(210, "Largura máxima de 210 mm."),
  height_mm: z.number().min(15, "Altura mínima de 15 mm.").max(297, "Altura máxima de 297 mm."),
  elements: z.array(labelElementSchema).max(80, "Máximo de 80 elementos."),
  background_path: z.string().max(300).nullable(),
});

export type LabelTemplateInput = z.infer<typeof labelTemplateSchema>;
export type LabelTemplate = LabelTemplateInput & { id: string | null; kind: LabelKind };

export const SIZE_PRESETS = [
  { label: "10 × 15 cm (térmica)", w: 100, h: 150 },
  { label: "10 × 10 cm", w: 100, h: 100 },
  { label: "10 × 5 cm", w: 100, h: 50 },
  { label: "6 × 4 cm", w: 60, h: 40 },
  { label: "A6 (10,5 × 14,8 cm)", w: 105, h: 148 },
] as const;

/** Campos disponíveis nos textos (chave → rótulo e exemplo). */
export const LABEL_FIELDS = [
  { key: "pedido.numero", label: "Número do pedido", example: "#1042" },
  { key: "pedido.canal", label: "Canal", example: "WhatsApp" },
  { key: "pedido.prazo", label: "Prazo / postar até", example: "20/10/2026" },
  { key: "pedido.itens", label: "Itens (lista)", example: "2 × Caneca 325ml\n1 × Chaveiro" },
  { key: "pedido.qtd_itens", label: "Quantidade de itens", example: "3" },
  { key: "pedido.rastreio", label: "Código de rastreio", example: "BR123456789XX" },
  { key: "pedido.marketplace", label: "Nº do pedido na Shopee", example: "2410ABCXYZ" },
  { key: "pedido.observacoes", label: "Observações", example: "Embrulhar para presente" },
  { key: "cliente.nome", label: "Cliente — nome", example: "Maria Souza" },
  {
    key: "cliente.endereco",
    label: "Cliente — endereço",
    example: "Rua das Flores, 120 – Apto 12\nCentro\nSão Paulo/SP\nCEP 01234-567",
  },
  { key: "cliente.telefone", label: "Cliente — telefone", example: "(11) 98765-4321" },
  { key: "cliente.documento", label: "Cliente — CPF/CNPJ", example: "123.456.789-09" },
  { key: "grafica.nome", label: "Gráfica — nome", example: "Smart Gráfica" },
  {
    key: "grafica.endereco",
    label: "Gráfica — endereço",
    example: "Av. Brasil, 500\nJardim América\nCampinas/SP\nCEP 13000-000",
  },
  { key: "grafica.telefone", label: "Gráfica — telefone", example: "(19) 3333-4444" },
  { key: "grafica.cnpj", label: "Gráfica — CNPJ", example: "12.345.678/0001-90" },
] as const;

export type LabelData = Record<(typeof LABEL_FIELDS)[number]["key"], string>;

export const SAMPLE_DATA = Object.fromEntries(
  LABEL_FIELDS.map((f) => [f.key, f.example]),
) as LabelData;

const FIELD = /\{([a-z_]+\.[a-z_]+)\}/g;

/**
 * Troca {campo} pelo valor; campo desconhecido fica como está. Linha em que
 * todos os campos vieram vazios some (evita "Tel." sem telefone).
 */
export function fillText(text: string, data: Partial<LabelData>) {
  const value = (key: string) => data[key as keyof LabelData] ?? "";
  return text
    .split("\n")
    .flatMap((line) => {
      const known = [...line.matchAll(FIELD)].map((m) => m[1]).filter((k) => k in data);
      if (known.length && known.every((k) => !value(k))) return [];
      return [line.replace(FIELD, (m, key: string) => (key in data ? value(key) : m))];
    })
    .join("\n");
}

let counter = 0;
export function newElementId() {
  counter += 1;
  return `el${Date.now().toString(36)}${counter}`;
}

const text = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  size: number,
  opts: { bold?: boolean; align?: "left" | "center" | "right"; border?: boolean } = {},
): LabelElement => ({
  id,
  type: "text",
  x,
  y,
  w,
  h,
  text: value,
  size,
  bold: opts.bold ?? false,
  align: opts.align ?? "left",
  border: opts.border ?? false,
});

/** Modelos embutidos do GraphicX (usados quando a gráfica não tem o seu). */
export const BUILTIN_TEMPLATES: Record<LabelKind, LabelTemplate> = {
  envio: {
    id: null,
    kind: "envio",
    name: "Modelo GraphicX",
    width_mm: 100,
    height_mm: 150,
    background_path: null,
    elements: [
      { id: "b1", type: "box", x: 5, y: 5, w: 90, h: 62, radius: 1 },
      text("t1", 8, 7, 84, 5, "DESTINATÁRIO", 7, { bold: true }),
      text("t2", 8, 12, 84, 9, "{cliente.nome}", 14, { bold: true }),
      text("t3", 8, 22, 84, 36, "{cliente.endereco}", 11),
      text("t4", 8, 59, 84, 6, "Tel. {cliente.telefone}", 9),
      { id: "b2", type: "box", x: 5, y: 71, w: 90, h: 38, radius: 1 },
      text("t5", 8, 73, 84, 5, "REMETENTE", 7, { bold: true }),
      text("t6", 8, 78, 84, 6, "{grafica.nome}", 10, { bold: true }),
      text("t7", 8, 85, 84, 18, "{grafica.endereco}", 8),
      text("t8", 8, 103, 84, 5, "Tel. {grafica.telefone}", 8),
      text("t9", 6, 118, 58, 14, "{pedido.numero}", 28, { bold: true }),
      text("t10", 6, 133, 58, 6, "{pedido.qtd_itens} item(ns)", 9),
      text("t11", 6, 139, 58, 6, "{pedido.rastreio}", 9),
      { id: "q1", type: "qr", x: 66, y: 115, w: 28, h: 28 },
    ],
  },
  identificacao: {
    id: null,
    kind: "identificacao",
    name: "Modelo GraphicX",
    width_mm: 100,
    height_mm: 150,
    background_path: null,
    elements: [
      text("t1", 6, 6, 50, 15, "{pedido.numero}", 32, { bold: true }),
      text("t2", 6, 22, 50, 7, "{cliente.nome}", 11, { bold: true }),
      text("t3", 6, 29, 50, 6, "{pedido.canal} {pedido.marketplace}", 9),
      { id: "q1", type: "qr", x: 54, y: 6, w: 40, h: 40 },
      text("t4", 6, 50, 88, 8, "Prazo {pedido.prazo}", 10, { bold: true, border: true }),
      text("t5", 6, 61, 88, 70, "{pedido.itens}", 9),
      text("t6", 6, 138, 88, 6, "Aponte a câmera para abrir o pedido no GraphicX", 7),
    ],
  },
};

/** Elemento novo, no meio da etiqueta. */
export function createElement(type: ElementType, width: number, height: number): LabelElement {
  const id = newElementId();
  const cx = (w: number) => Math.max(0, Math.round((width - w) / 2));
  const cy = (h: number) => Math.max(0, Math.round((height - h) / 2));
  switch (type) {
    case "text":
      return text(id, cx(60), cy(10), 60, 10, "Texto", 10);
    case "qr":
      return { id, type, x: cx(25), y: cy(25), w: 25, h: 25 };
    case "image":
      return { id, type, x: cx(30), y: cy(15), w: 30, h: 15, path: null, fit: "contain" };
    case "box":
      return { id, type, x: cx(50), y: cy(30), w: 50, h: 30, radius: 1 };
    case "line":
      return { id, type, x: cx(60), y: cy(1), w: 60, h: 0.4 };
  }
}
