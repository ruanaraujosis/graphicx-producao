import { z } from "zod";
import { digits, isValidCnpj, isValidCpf } from "@/lib/documents";

/**
 * Peças de schema para formulários: aceitam o texto cru do input (o mesmo que a
 * Server Action recebe) e convertem para o formato do banco.
 */

const trim = (v: unknown) => (typeof v === "string" ? v.trim() : v);

/** Texto opcional: "" vira null. */
export const optionalText = (max: number) =>
  z.preprocess(
    (v) => {
      const t = trim(v);
      return t === "" || t === undefined ? null : t;
    },
    z.string().max(max, `Máximo de ${max} caracteres.`).nullable(),
  );

export const requiredText = (label: string, min = 2, max = 160) =>
  z.preprocess(
    trim,
    z
      .string({ error: `Informe ${label}.` })
      .min(min, `Informe ${label}.`)
      .max(max, `Máximo de ${max} caracteres.`),
  );

/** Número em formato brasileiro ("1.234,56" ou "1234.56"). */
export function parseDecimal(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t === "") return undefined;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : Number.NaN;
}

type NumberOpts = { label: string; min?: number; max?: number };

function numberSchema(opts: NumberOpts, int: boolean) {
  let num = z.number({ error: `${opts.label}: informe um número${int ? " inteiro" : ""}.` });
  if (int) num = num.int(`${opts.label}: use um número inteiro.`);
  if (opts.min !== undefined) num = num.min(opts.min, `${opts.label}: mínimo ${opts.min}.`);
  if (opts.max !== undefined) num = num.max(opts.max, `${opts.label}: máximo ${opts.max}.`);
  return num;
}

/** Número obrigatório (aceita "1.234,56"). Com `optional: true`, vazio vira null. */
export function decimal(opts: NumberOpts & { optional: true }): z.ZodType<number | null>;
export function decimal(opts: NumberOpts & { optional?: false }): z.ZodType<number>;
export function decimal(opts: NumberOpts & { optional?: boolean }): z.ZodType<number | null> {
  const num = numberSchema(opts, false);
  return opts.optional
    ? (z.preprocess((v) => parseDecimal(v) ?? null, num.nullable()) as z.ZodType<number | null>)
    : (z.preprocess((v) => parseDecimal(v), num) as z.ZodType<number>);
}

export function integer(opts: NumberOpts & { optional: true }): z.ZodType<number | null>;
export function integer(opts: NumberOpts & { optional?: false }): z.ZodType<number>;
export function integer(opts: NumberOpts & { optional?: boolean }): z.ZodType<number | null> {
  const num = numberSchema(opts, true);
  return opts.optional
    ? (z.preprocess((v) => parseDecimal(v) ?? null, num.nullable()) as z.ZodType<number | null>)
    : (z.preprocess((v) => parseDecimal(v), num) as z.ZodType<number>);
}

export const optionalEmail = z.preprocess((v) => {
  const t = trim(v);
  return t === "" || t === undefined ? null : String(t).toLowerCase();
}, z.email("E-mail inválido.").nullable());

/** Telefone/WhatsApp: guarda só os dígitos (10 a 13). */
export const optionalPhone = z.preprocess(
  (v) => {
    const d = typeof v === "string" ? digits(v) : "";
    return d === "" ? null : d;
  },
  z
    .string()
    .regex(/^\d{10,13}$/, "Telefone inválido (DDD + número).")
    .nullable(),
);

export const optionalCep = z.preprocess(
  (v) => {
    const d = typeof v === "string" ? digits(v) : "";
    return d === "" ? null : d;
  },
  z
    .string()
    .regex(/^\d{8}$/, "CEP deve ter 8 dígitos.")
    .nullable(),
);

export const optionalUf = z.preprocess(
  (v) => {
    const t = typeof v === "string" ? v.trim().toUpperCase() : "";
    return t === "" ? null : t;
  },
  z
    .string()
    .regex(/^[A-Z]{2}$/, "UF inválida.")
    .nullable(),
);

/** CPF (11) ou CNPJ (14) com dígitos verificadores; guarda só os dígitos. */
export const optionalDocument = z.preprocess(
  (v) => {
    const d = typeof v === "string" ? digits(v) : "";
    return d === "" ? null : d;
  },
  z
    .string()
    .refine((d) => (d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false), {
      message: "CPF ou CNPJ inválido.",
    })
    .nullable(),
);

export const optionalUuid = z.preprocess(
  (v) => (v === "" || v === undefined || v === "__none" ? null : v),
  z.uuid().nullable(),
);

export const bool = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());
