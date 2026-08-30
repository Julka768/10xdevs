import { z } from "zod";
import { isNotFutureDate } from "@/lib/date-utils";

export const optionalMeasurement = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? null : val),
  z.union([z.null(), z.coerce.number().positive()]),
);

export const measurementLogInputSchema = z.object({
  weight: z.coerce.number().positive(),
  waist: optionalMeasurement,
  chest: optionalMeasurement,
  hips: optionalMeasurement,
  arms: optionalMeasurement,
  thighs: optionalMeasurement,
  logged_at: z
    .string()
    .refine((value) => isNotFutureDate(value, new Date()), { message: "Date cannot be in the future" }),
});

export const measurementTypeInputSchema = z.object({
  name: z.string().trim().min(1),
});
