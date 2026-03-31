import type { OracleEvaluationResult } from "@padala-vision/shared";
import type { VisionOracleProvider } from "./types.js";

export class StubVisionProvider implements VisionOracleProvider {
  async evaluateDeliveryEvidence(): Promise<OracleEvaluationResult> {
    return {
      decision: "APPROVE",
      confidence: 0.93,
      fraudFlags: [],
      reason: "Stub provider approved the evidence for the MVP happy path.",
      attestation: null,
    };
  }
}
