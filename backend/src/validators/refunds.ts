import { z } from "zod";

export const refundIntentSchema = z.object({
  order_id: z.string().min(1),
});
