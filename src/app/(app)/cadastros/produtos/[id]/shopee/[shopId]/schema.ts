import { z } from "zod";

export const publicationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(10, "O título precisa ter pelo menos 10 caracteres.")
    .max(120, "Máximo de 120 caracteres."),
  description: z
    .string()
    .trim()
    .min(20, "A descrição precisa ter pelo menos 20 caracteres.")
    .max(5000, "Máximo de 5.000 caracteres."),
  category_id: z.number().int().positive().nullable(),
  category_path: z.string().max(1000).nullable(),
  attributes: z
    .array(
      z.object({
        attribute_id: z.number().int(),
        values: z
          .array(
            z.object({
              value_id: z.number().int(),
              original_value_name: z.string().max(200).optional(),
              value_unit: z.string().max(20).optional(),
            }),
          )
          .max(30),
      }),
    )
    .max(100),
  logistics: z.array(z.number().int()).max(30),
  item_status: z.enum(["NORMAL", "UNLIST"]),
});

export type PublicationInput = z.infer<typeof publicationSchema>;
