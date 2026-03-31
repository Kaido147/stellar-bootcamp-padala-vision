import { z } from "zod";

export const releaseIntentSchema = z.object({
  order_id: z.string().min(1),
});
