import { z } from "zod";

export const createOrderSchema = z.object({
  seller_wallet: z.string().min(1),
  buyer_wallet: z.string().min(1),
  item_amount: z.string().min(1),
  delivery_fee: z.string().min(1),
  expires_at: z.string().datetime(),
});

export const acceptJobSchema = z.object({
  rider_wallet: z.string().min(1),
});

export const markInTransitSchema = z.object({
  rider_wallet: z.string().min(1),
});

export const orderActionRecordSchema = z.object({
  action_intent_id: z.string().uuid(),
  tx_hash: z.string().min(1),
  submitted_wallet: z.string().min(1),
});

export const evidenceSubmitSchema = z.object({
  order_id: z.string().min(1),
  rider_wallet: z.string().min(1),
  image_url: z.string().url(),
  storage_path: z.string().min(1).optional(),
  file_hash: z.string().min(1).optional(),
  gps: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  timestamp: z.string().datetime(),
});

export const releaseSchema = z.object({
  order_id: z.string().min(1),
  tx_hash: z.string().min(1),
  attestation_nonce: z.string().length(64),
  submitted_wallet: z.string().min(1),
});
