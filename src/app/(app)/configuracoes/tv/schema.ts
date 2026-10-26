import { z } from "zod";
import { bool, integer, requiredText } from "@/lib/form-schemas";

export const tvDeviceSchema = z.object({
  name: requiredText("o nome da TV", 2, 60),
  show_financials: bool,
});

export const tvRotationSchema = z.object({
  tv_rotation_seconds: integer({ label: "Tempo de cada tela", min: 5, max: 120 }),
});
