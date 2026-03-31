import { z } from "zod";

export const walletChallengeSchema = z.object({
  wallet_address: z.string().min(1),
  wallet_provider: z.string().trim().min(1).default("freighter"),
});

export const walletVerifySchema = z.object({
  challenge_id: z.string().uuid(),
  wallet_address: z.string().min(1),
  signature: z.string().min(1),
  signed_message: z.string().min(1),
});
