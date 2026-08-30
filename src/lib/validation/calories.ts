import { z } from "zod";
import { isNotFutureDate } from "@/lib/date-utils";

export const calorieLogInputSchema = z.object({
  calories: z.coerce.number().int().positive(),
  logged_at: z
    .string()
    .refine((value) => isNotFutureDate(value, new Date()), { message: "Date cannot be in the future" }),
});
