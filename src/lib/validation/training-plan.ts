import { z } from "zod";
import { isNotFutureDate } from "@/lib/date-utils";

export const planNameSchema = z.string().trim().min(1).max(120);

export const exerciseInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  target_sets: z.coerce.number().int().positive(),
  target_reps: z.string().trim().min(1).max(20),
});

export const workoutLogInputSchema = z.object({
  weight: z.coerce.number().positive(),
  reps: z.coerce.number().int().positive(),
  sets_completed: z.coerce.number().int().positive(),
  logged_at: z
    .string()
    .refine((value) => isNotFutureDate(value, new Date()), { message: "Date cannot be in the future" }),
});
