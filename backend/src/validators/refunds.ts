import { z } from "zod";

export const refundIntentSchema = z.object({
  order_id: z.string().min(1),
});

export const refundRecordSchema = z.object({
  order_id: z.string().min(1),
  refund_intent_id: z.string().uuid(),
  tx_hash: z.string().min(1),
  submitted_wallet: z.string().min(1),
});
