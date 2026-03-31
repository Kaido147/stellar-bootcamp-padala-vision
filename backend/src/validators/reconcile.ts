import { z } from "zod";

export const reconcileOrderSchema = z.object({
  force_refresh: z.boolean().optional(),
});
