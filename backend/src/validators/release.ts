import { z } from "zod";

export const releaseIntentSchema = z.object({
  order_id: z.string().min(1),
});

export const releaseRecordSchema = z.object({
  order_id: z.string().min(1),
  tx_hash: z.string().min(1),
  attestation_nonce: z.string().length(64),
  submitted_wallet: z.string().min(1),
});
