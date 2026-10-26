import { z } from "zod";
import { SALES_CHANNELS } from "@/lib/catalog/pricing";
import {
  bool,
  optionalCep,
  optionalDocument,
  optionalEmail,
  optionalPhone,
  optionalText,
  optionalUf,
  requiredText,
} from "@/lib/form-schemas";

export const customerSchema = z
  .object({
    person_type: z.enum(["pf", "pj"]),
    name: requiredText("o nome"),
    legal_name: optionalText(200),
    document: optionalDocument,
    email: optionalEmail,
    phone: optionalPhone,
    whatsapp: optionalPhone,
    origin: z.enum(SALES_CHANNELS),
    cep: optionalCep,
    street: optionalText(160),
    number: optionalText(20),
    complement: optionalText(80),
    district: optionalText(80),
    city: optionalText(80),
    state: optionalUf,
    notes: optionalText(2000),
    active: bool,
  })
  .refine(
    (v) =>
      !v.document || (v.person_type === "pf" ? v.document.length === 11 : v.document.length === 14),
    { path: ["document"], message: "Pessoa física usa CPF; pessoa jurídica usa CNPJ." },
  );
