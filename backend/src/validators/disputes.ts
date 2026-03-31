import { z } from "zod";

export const createDisputeSchema = z.object({
  order_id: z.string().min(1),
  reason_code: z.string().trim().min(1),
  description: z.string().trim().min(1),
  evidence_refs: z.array(z.string().trim().min(1)).max(20).optional(),
});
