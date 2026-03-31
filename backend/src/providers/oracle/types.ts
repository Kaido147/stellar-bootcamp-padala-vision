import type { EvidenceInput, OracleEvaluationResult, OrderRecord } from "@padala-vision/shared";

export interface VisionOracleProvider {
  evaluateDeliveryEvidence(input: {
    order: OrderRecord;
    evidence: EvidenceInput;
  }): Promise<OracleEvaluationResult>;
}
