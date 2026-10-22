import { z } from "zod";
import { requiredText } from "@/lib/form-schemas";

export const categorySchema = z.object({ name: requiredText("o nome", 2, 80) });
