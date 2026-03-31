import { ACTOR_ROLES } from "@padala-vision/shared";
import { z } from "zod";

export const sessionEnterSchema = z.object({
  role: z.enum(ACTOR_ROLES),
  workspaceCode: z.string().min(1),
  pin: z.string().min(1),
});

export const buyerInviteClaimSchema = z.object({
  token: z.string().min(1),
  pin: z.string().min(1),
  displayName: z.string().min(1).optional().nullable(),
});

export const sellerCreateWorkflowOrderSchema = z.object({
  buyerDisplayName: z.string().min(1),
  buyerContactLabel: z.string().min(1).optional().nullable(),
  itemDescription: z.string().min(1),
  pickupLabel: z.string().min(1),
  dropoffLabel: z.string().min(1),
  itemAmount: z.string().min(1),
  deliveryFee: z.string().min(1),
  totalAmount: z.string().min(1),
  fundingDeadlineAt: z.string().datetime(),
});

export const buyerConfirmFundingSchema = z.object({
  txHash: z.string().min(1),
  submittedWallet: z.string().min(1),
});

export const riderPickupSchema = z.object({
  pickedUpAt: z.string().datetime(),
});

export const riderSubmitProofSchema = z.object({
  imageUrl: z.string().url(),
  storagePath: z.string().min(1).optional().nullable(),
  fileHash: z.string().min(1).optional().nullable(),
  contentType: z.string().min(1).optional().nullable(),
  note: z.string().optional().nullable(),
  submittedAt: z.string().datetime(),
});

export const approveConfirmationSchema = z.object({
  pin: z.string().min(1),
});

export const rejectConfirmationSchema = z.object({
  pin: z.string().min(1),
  reasonCode: z.string().min(1),
  note: z.string().optional().nullable(),
});

export const operatorResolveDisputeSchema = z.object({
  resolution: z.enum(["release", "refund", "reject_dispute"]),
  note: z.string().optional().nullable(),
});
