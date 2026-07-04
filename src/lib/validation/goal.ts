import { z } from "zod";

export const goalInputSchema = z.object({
  goal_type: z.enum(["lose", "gain", "maintain"]),
});
