import { z } from "zod";

export const createDisputeSchema = z.object({
  order_id: z.string().min(1),
  reason_code: z.string().trim().min(1),
  description: z.string().trim().min(1),
  evidence_refs: z.array(z.string().trim().min(1)).max(20).optional(),
});

export const resolveDisputeSchema = z.object({
  resolution: z.enum(["release", "refund", "reject_dispute"]),
  reason: z.string().trim().min(1),
  note: z.string().trim().min(1),
  tx_hash: z.string().trim().min(1).optional(),
  attestation_nonce: z.string().length(64).optional(),
  submitted_wallet: z.string().trim().min(1).optional(),
});
