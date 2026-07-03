import { z } from "zod";

export const planNameSchema = z.string().trim().min(1).max(120);

export const exerciseInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  target_sets: z.coerce.number().int().positive(),
  target_reps: z.coerce.number().int().positive(),
});
