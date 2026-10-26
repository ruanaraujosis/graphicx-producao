import { z } from "zod";
import { isValidCnpj, normalizeCnpj, slugSchema } from "@/lib/auth/organization";
import { emailSchema, passwordSchema, usernameSchema } from "@/lib/auth/username";

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(emailSchema.optional());

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da gráfica.").max(120),
  slug: slugSchema,
  document: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : normalizeCnpj(v)))
    .refine((v) => v === undefined || isValidCnpj(v), "CNPJ inválido."),
  adminFullName: z.string().trim().min(2, "Informe o nome do administrador.").max(120),
  adminUsername: usernameSchema,
  adminEmail: optionalEmail,
  adminPassword: passwordSchema,
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

const optionalCnpj = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : normalizeCnpj(v)))
  .refine((v) => v === null || isValidCnpj(v), "CNPJ inválido.");

const optionalLegalName = z
  .string()
  .trim()
  .max(200, "Máximo de 200 caracteres.")
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || v.length >= 2, "Razão social muito curta.");

/** Dados que o dono da gráfica pode alterar (o código não). */
export const organizationDataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da gráfica.")
    .max(120, "Máximo de 120 caracteres."),
  legal_name: optionalLegalName,
  document: optionalCnpj,
});

/** Na plataforma, o SuperAdmin também altera o código. */
export const editOrganizationSchema = organizationDataSchema.extend({ slug: slugSchema });

export type OrganizationDataInput = z.input<typeof organizationDataSchema>;
export type EditOrganizationInput = z.input<typeof editOrganizationSchema>;
