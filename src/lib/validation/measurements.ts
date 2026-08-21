import { z } from "zod";

const optionalMeasurement = z.preprocess(
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
    .refine((value) => value <= new Date().toISOString().slice(0, 10), { message: "Date cannot be in the future" }),
});
