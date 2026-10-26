import { z } from "zod";
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

export const supplierSchema = z.object({
  name: requiredText("o nome"),
  legal_name: optionalText(200),
  document: optionalDocument,
  contact_name: optionalText(120),
  email: optionalEmail,
  phone: optionalPhone,
  cep: optionalCep,
  street: optionalText(160),
  number: optionalText(20),
  complement: optionalText(80),
  district: optionalText(80),
  city: optionalText(80),
  state: optionalUf,
  notes: optionalText(2000),
  active: bool,
});
