import { z } from "zod";

export const calorieLogInputSchema = z.object({
  calories: z.coerce.number().int().positive(),
  logged_at: z
    .string()
    .refine((value) => value <= new Date().toISOString().slice(0, 10), { message: "Date cannot be in the future" }),
});
