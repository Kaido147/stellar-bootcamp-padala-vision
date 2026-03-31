import { z } from "zod";

export const oracleDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "MANUAL_REVIEW"]),
  confidence: z.number().min(0).max(1),
  fraud_flags: z.array(z.string()),
  reason: z.string().min(1),
});

export type OracleDecisionPayload = z.infer<typeof oracleDecisionSchema>;

export const geminiResponseJsonSchema = {
  type: "object",
  properties: {
    decision: {
      type: "string",
      enum: ["APPROVE", "REJECT", "MANUAL_REVIEW"],
    },
    confidence: {
      type: "number",
    },
    fraud_flags: {
      type: "array",
      items: { type: "string" },
    },
    reason: {
      type: "string",
    },
  },
  required: ["decision", "confidence", "fraud_flags", "reason"],
} as const;
