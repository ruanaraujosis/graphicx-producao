import { z } from "zod";
import { decimal } from "@/lib/form-schemas";

/** Comissão do vendedor: percentual sobre as vendas; vazio = sem comissão. */
export const commissionSchema = z.object({
  rate: decimal({ label: "Comissão", min: 0, max: 100, optional: true }),
});
