import { z } from "zod";
import type { OrderTimelineEntry, ProofAnalysisResult } from "@padala-vision/shared";
import { env } from "../config/env.js";
import type { WorkflowOrderRecord } from "../lib/foundation-repository.js";
import type { DisputeRecord } from "../lib/repository.js";

const workflowAiSchema = z.object({
  summary: z.string().trim().min(1),
  risk_flags: z.array(z.string().trim().min(1)).max(6),
  decision_suggestion: z.string().trim().min(1),
  quality_assessment: z.enum(["clear", "blurry", "dark", "low_confidence"]),
  confidence_label: z.enum(["high", "medium", "low"]),
  operator_notes: z.string().trim().min(1),
});

const workflowAiResponseSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    risk_flags: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    decision_suggestion: { type: "STRING" },
    quality_assessment: {
      type: "STRING",
      enum: ["clear", "blurry", "dark", "low_confidence"],
    },
    confidence_label: {
      type: "STRING",
      enum: ["high", "medium", "low"],
    },
    operator_notes: { type: "STRING" },
  },
  required: ["summary", "risk_flags", "decision_suggestion", "quality_assessment", "confidence_label", "operator_notes"],
} as const;

export interface WorkflowAiAdvice {
  summary: string;
  riskFlags: string[];
  decisionSuggestion: string;
}

export interface WorkflowProofAdvice extends ProofAnalysisResult {
  decisionSuggestion: string | null;
}

export class WorkflowAiService {
  buildQueuePreview(input: {
    order: WorkflowOrderRecord;
    timeline: OrderTimelineEntry[];
    dispute?: DisputeRecord | null;
  }): WorkflowAiAdvice {
    const proof = getLatestProof(input.timeline);
    const riskFlags = buildRiskFlags(input.order, proof, input.dispute);

    return {
      summary: buildFallbackSummary(input.order, proof, input.dispute),
      riskFlags,
      decisionSuggestion: buildDecisionSuggestion(input.order.workflowStatus, input.dispute, riskFlags),
    };
  }

  async buildReviewAdvice(input: {
    order: WorkflowOrderRecord;
    timeline: OrderTimelineEntry[];
    dispute?: DisputeRecord | null;
  }): Promise<WorkflowAiAdvice> {
    const preview = this.buildQueuePreview(input);

    if (!env.GEMINI_API_KEY) {
      return preview;
    }

    try {
      const proof = getLatestProof(input.timeline);
      const gemini = await this.requestGeminiAdvice({
        title: "Delivery review advisory",
        order: input.order,
        timeline: input.timeline,
        dispute: input.dispute ?? null,
        proof,
      });

      return {
        summary: gemini.summary || preview.summary,
        riskFlags: gemini.riskFlags.length > 0 ? gemini.riskFlags : preview.riskFlags,
        decisionSuggestion: gemini.decisionSuggestion || preview.decisionSuggestion,
      };
    } catch {
      return preview;
    }
  }

  async buildConfirmationAdvice(input: {
    order: WorkflowOrderRecord;
    timeline: OrderTimelineEntry[];
  }): Promise<WorkflowAiAdvice> {
    const preview = this.buildQueuePreview(input);

    if (!env.GEMINI_API_KEY) {
      return {
        ...preview,
        riskFlags: preview.riskFlags.filter((flag) => flag !== "BUYER_CONFIRMATION_OVERDUE" && flag !== "DISPUTE_OPEN"),
      };
    }

    try {
      const proof = getLatestProof(input.timeline);
      const gemini = await this.requestGeminiAdvice({
        title: "Buyer confirmation proof summary",
        order: input.order,
        timeline: input.timeline,
        dispute: null,
        proof,
      });

      return {
        summary: gemini.summary || preview.summary,
        riskFlags:
          gemini.riskFlags.filter((flag) => flag !== "DISPUTE_OPEN" && flag !== "BUYER_CONFIRMATION_OVERDUE") ||
          preview.riskFlags,
        decisionSuggestion: gemini.decisionSuggestion || "Review the proof, then explicitly approve delivery or report an issue.",
      };
    } catch {
      return preview;
    }
  }

  async analyzeProof(input: {
    order: WorkflowOrderRecord;
    timeline: OrderTimelineEntry[];
    proof: {
      imageUrl: string | null;
      storagePath: string | null;
      fileHash: string | null;
      contentType: string | null;
      submittedAt: string;
      note: string | null;
    };
  }): Promise<WorkflowProofAdvice> {
    const preview = buildFallbackProofAdvice(input.order, input.proof);

    if (!env.GEMINI_API_KEY) {
      return preview;
    }

    try {
      const gemini = await this.requestGeminiAdvice({
        title: "Delivery proof analysis",
        order: input.order,
        timeline: input.timeline,
        dispute: null,
        proof: input.proof,
      });

      return {
        analysisStatus: "available",
        summary: gemini.summary || preview.summary,
        qualityAssessment: gemini.qualityAssessment,
        confidenceLabel: gemini.confidenceLabel,
        riskFlags: gemini.riskFlags.length > 0 ? gemini.riskFlags : preview.riskFlags,
        operatorNotes: gemini.operatorNotes || preview.operatorNotes,
        decisionSuggestion: gemini.decisionSuggestion || preview.decisionSuggestion,
      };
    } catch {
      return preview;
    }
  }

  private async requestGeminiAdvice(input: {
    title: string;
    order: WorkflowOrderRecord;
    timeline: OrderTimelineEntry[];
    dispute: DisputeRecord | null;
    proof: ReturnType<typeof getLatestProof>;
  }): Promise<{
    summary: string;
    riskFlags: string[];
    decisionSuggestion: string;
    qualityAssessment: WorkflowProofAdvice["qualityAssessment"];
    confidenceLabel: WorkflowProofAdvice["confidenceLabel"];
    operatorNotes: string;
  }> {
    const parts: Array<Record<string, unknown>> = [
      {
        text: [
          `${input.title}.`,
          `Order status: ${input.order.workflowStatus}.`,
          `Order code: ${input.order.publicOrderCode}.`,
          `Pickup label: ${input.order.pickupLabel}.`,
          `Dropoff label: ${input.order.dropoffLabel}.`,
          `Funding deadline: ${input.order.fundingDeadlineAt}.`,
          `Buyer confirmation due: ${input.order.buyerConfirmationDueAt ?? "not active"}.`,
          `Manual review reason: ${input.order.manualReviewReason ?? "none"}.`,
          `Latest proof submitted: ${input.proof?.submittedAt ?? "none"}.`,
          `Latest proof note: ${input.proof?.note ?? "none"}.`,
          `Latest proof storage path: ${input.proof?.storagePath ?? "none"}.`,
          `Latest proof file hash: ${input.proof?.fileHash ?? "none"}.`,
          `Latest proof content type: ${input.proof?.contentType ?? "unknown"}.`,
          input.dispute
            ? `Dispute context: reason=${input.dispute.reasonCode}; description=${input.dispute.description}; created_at=${input.dispute.createdAt}.`
            : "No dispute is currently open.",
          `Timeline events: ${input.timeline
            .slice(-8)
            .map((entry) => `${entry.type} at ${entry.occurredAt} note=${entry.note ?? "none"}`)
            .join(" | ")}.`,
          "Return concise operations-ready JSON only.",
          "This advice is advisory only. Never imply automatic confirmation, release, or refund.",
        ].join(" "),
      },
    ];

    if (input.proof?.imageUrl) {
      try {
        const imageResponse = await fetch(input.proof.imageUrl, {
          signal: AbortSignal.timeout(10_000),
        });
        if (imageResponse.ok) {
          const mimeType = imageResponse.headers.get("content-type") ?? "image/jpeg";
          const imageBytes = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
          parts.push({
            inlineData: {
              mimeType,
              data: imageBytes,
            },
          });
        }
      } catch {
        // Fall back to text-only advisory generation.
      }
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY ?? "",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are an operator copilot for a delivery escrow workflow. Return JSON only, no markdown. Be concise, cautious, and advisory. Prefer highlighting uncertainty over overclaiming.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts,
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: workflowAiResponseSchema,
            temperature: 0.2,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      error?: {
        message?: string;
      };
    };

    if (body.error?.message) {
      throw new Error(body.error.message);
    }

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini advisory response was empty");
    }

    const parsed = workflowAiSchema.parse(JSON.parse(text));

    return {
      summary: parsed.summary,
      riskFlags: parsed.risk_flags,
      decisionSuggestion: parsed.decision_suggestion,
      qualityAssessment: parsed.quality_assessment,
      confidenceLabel: parsed.confidence_label,
      operatorNotes: parsed.operator_notes,
    };
  }
}

function getLatestProof(timeline: OrderTimelineEntry[]) {
  const latest = [...timeline]
    .reverse()
    .find((entry) => entry.type === "proof_submitted" || entry.type === "proof_uploaded");

  if (!latest) {
    return null;
  }

  return {
    imageUrl: readString(latest.metadata.imageUrl),
    storagePath: readString(latest.metadata.storagePath),
    fileHash: readString(latest.metadata.fileHash),
    contentType: readString(latest.metadata.contentType),
    submittedAt: latest.occurredAt,
    note: latest.note,
  };
}

function buildRiskFlags(
  order: WorkflowOrderRecord,
  proof: ReturnType<typeof getLatestProof>,
  dispute?: DisputeRecord | null,
) {
  const flags = new Set<string>();

  if (!proof) {
    flags.add("NO_PROOF_CAPTURED");
  }

  if (proof && !proof.storagePath) {
    flags.add("PROOF_STORAGE_REFERENCE_MISSING");
  }

  if (proof && !proof.fileHash) {
    flags.add("PROOF_FILE_HASH_MISSING");
  }

  if (proof?.note?.toLowerCase().includes("manual_review")) {
    flags.add("RIDER_REQUESTED_MANUAL_REVIEW");
  }

  if (order.workflowStatus === "manual_review") {
    flags.add("MANUAL_REVIEW_STATE");
  }

  if (order.workflowStatus === "awaiting_buyer_confirmation" && order.buyerConfirmationDueAt) {
    if (new Date(order.buyerConfirmationDueAt).getTime() < Date.now()) {
      flags.add("BUYER_CONFIRMATION_OVERDUE");
    }
  }

  if (dispute) {
    flags.add("DISPUTE_OPEN");
    flags.add(`DISPUTE_REASON_${dispute.reasonCode.toUpperCase()}`);
  }

  return [...flags].slice(0, 6);
}

function buildFallbackSummary(
  order: WorkflowOrderRecord,
  proof: ReturnType<typeof getLatestProof>,
  dispute?: DisputeRecord | null,
) {
  if (dispute) {
    return `A buyer dispute is open for ${order.publicOrderCode}. The latest workflow status is ${order.workflowStatus}, and the dispute reason is ${dispute.reasonCode.replace(/_/g, " ")}.`;
  }

  if (!proof) {
    return `No proof artifact is attached to ${order.publicOrderCode} yet. Review the rider workflow history before deciding what to do next.`;
  }

  return `Latest proof for ${order.publicOrderCode} was submitted at ${proof.submittedAt}. Review the proof metadata and timeline before moving the workflow forward.`;
}

function buildFallbackProofAdvice(
  order: WorkflowOrderRecord,
  proof: {
    imageUrl: string | null;
    storagePath: string | null;
    fileHash: string | null;
    contentType: string | null;
    submittedAt: string;
    note: string | null;
  },
): WorkflowProofAdvice {
  const riskFlags = new Set<string>();

  if (!proof.storagePath) {
    riskFlags.add("PROOF_STORAGE_REFERENCE_MISSING");
  }

  if (!proof.fileHash) {
    riskFlags.add("PROOF_FILE_HASH_MISSING");
  }

  const note = proof.note?.toLowerCase() ?? "";
  if (note.includes("manual_review")) {
    riskFlags.add("RIDER_REQUESTED_MANUAL_REVIEW");
  }

  riskFlags.add("PROOF_ANALYSIS_UNAVAILABLE");

  const derivedQuality = deriveFallbackQualityAssessment(proof);
  if (derivedQuality === "dark") {
    riskFlags.add("PROOF_VISIBILITY_LIMITED");
  }
  if (derivedQuality === "low_confidence") {
    riskFlags.add("PROOF_RENDER_REVIEW_RECOMMENDED");
  }

  return {
    analysisStatus: "unavailable",
    summary: `Gemini analysis is currently unavailable for ${order.publicOrderCode}. Review the uploaded proof image directly before continuing.`,
    qualityAssessment: "analysis_unavailable",
    confidenceLabel: "unavailable",
    riskFlags: [...riskFlags].slice(0, 6),
    operatorNotes:
      derivedQuality === "low_confidence"
        ? "Automated analysis is unavailable and the available proof metadata suggests the image should be reviewed manually before accepting it as sufficient."
        : "Automated analysis is unavailable. Review the rendered proof image together with the rider note and timeline before deciding whether the workflow can proceed.",
    decisionSuggestion:
      "Use the proof image as the primary evidence source. Escalate to manual review if the image is unclear, inconsistent, or missing expected handoff details.",
  };
}

function buildDecisionSuggestion(
  status: WorkflowOrderRecord["workflowStatus"],
  dispute?: DisputeRecord | null,
  riskFlags: string[] = [],
): string {
  if (dispute) {
    return "Review the dispute reason, evidence, and timeline together, then decide whether to reject the dispute, release, or refund.";
  }

  if (status === "manual_review") {
    return "Inspect the proof and timeline, then decide whether the buyer should still confirm, the order should be refunded, or the case should move into dispute.";
  }

  if (status === "awaiting_buyer_confirmation") {
    return riskFlags.includes("BUYER_CONFIRMATION_OVERDUE")
      ? "Buyer confirmation is overdue. Consider reissuing confirmation access or moving the order into manual review."
      : "Wait for the buyer's explicit confirmation, or reissue confirmation access if the buyer lost the link.";
  }

  if (status === "release_pending") {
    return "Monitor settlement and confirm the release reaches a final on-chain state.";
  }

  if (status === "refund_pending") {
    return "Monitor settlement and confirm the refund reaches a final on-chain state.";
  }

  return "Review the latest workflow state and continue from the next explicit human decision point.";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function deriveFallbackQualityAssessment(proof: { note: string | null; contentType: string | null }) {
  const note = proof.note?.toLowerCase() ?? "";

  if (note.includes("blurry")) {
    return "blurry" as const;
  }

  if (note.includes("dark") || note.includes("night")) {
    return "dark" as const;
  }

  if (!proof.contentType?.startsWith("image/")) {
    return "low_confidence" as const;
  }

  return "clear" as const;
}
