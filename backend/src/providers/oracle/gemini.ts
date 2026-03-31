import { env } from "../../config/env.js";
import { geminiResponseJsonSchema, oracleDecisionSchema } from "../../lib/oracle-schema.js";
import type { OracleEvaluationResult } from "@padala-vision/shared";
import type { VisionOracleProvider } from "./types.js";

export class GeminiVisionProvider implements VisionOracleProvider {
  async evaluateDeliveryEvidence(input: {
    order: { id: string };
    evidence: {
      imageUrl: string;
      gps: { lat: number; lng: number };
      timestamp: string;
      riderWallet: string;
    };
  }): Promise<OracleEvaluationResult> {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is required for GeminiVisionProvider");
    }

    const imageResponse = await fetch(input.evidence.imageUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch evidence image: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    const mimeType = imageResponse.headers.get("content-type") ?? "image/jpeg";
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are a delivery evidence oracle for a minimized-trust escrow app. Return JSON only. Do not claim certainty beyond the image and metadata provided. Prefer MANUAL_REVIEW when uncertain. Freeform text must not include markdown.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    `Evaluate delivery evidence for order ${input.order.id}.`,
                    `Rider wallet: ${input.evidence.riderWallet}.`,
                    `GPS: (${input.evidence.gps.lat}, ${input.evidence.gps.lng}).`,
                    `Timestamp: ${input.evidence.timestamp}.`,
                    "Return a structured decision for whether the evidence plausibly supports successful same-day local parcel delivery.",
                    "Use APPROVE only when the image and metadata are reasonably consistent with a completed handoff. Use MANUAL_REVIEW when uncertain.",
                  ].join(" "),
                },
                {
                  inlineData: {
                    mimeType,
                    data: imageBytes,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: geminiResponseJsonSchema,
            temperature: 0.1,
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
      throw new Error(`Gemini API error: ${body.error.message}`);
    }

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini response did not contain structured text");
    }

    const parsed = oracleDecisionSchema.parse(JSON.parse(text));
    return {
      decision: parsed.decision,
      confidence: parsed.confidence,
      fraudFlags: parsed.fraud_flags,
      reason: parsed.reason,
      attestation: null,
    };
  }
}
