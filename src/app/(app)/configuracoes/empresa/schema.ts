import { organizationDataSchema } from "@/app/(app)/plataforma/schemas";
import { optionalCep, optionalPhone, optionalText, optionalUf } from "@/lib/form-schemas";

/** Dados que a própria gráfica edita: nome, razão social, CNPJ, telefone e endereço. */
export const organizationProfileSchema = organizationDataSchema.extend({
  phone: optionalPhone,
  cep: optionalCep,
  street: optionalText(160),
  number: optionalText(20),
  complement: optionalText(80),
  district: optionalText(80),
  city: optionalText(80),
  state: optionalUf,
});
