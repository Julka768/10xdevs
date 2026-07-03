import { z } from "zod";

export const planNameSchema = z.string().trim().min(1).max(120);

export const exerciseInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  target_sets: z.coerce.number().int().positive(),
  target_reps: z.coerce.number().int().positive(),
});

export const workoutLogInputSchema = z.object({
  weight: z.coerce.number().positive(),
  reps: z.coerce.number().int().positive(),
  sets_completed: z.coerce.number().int().positive(),
  logged_at: z
    .string()
    .refine((value) => value <= new Date().toISOString().slice(0, 10), { message: "Date cannot be in the future" }),
});
