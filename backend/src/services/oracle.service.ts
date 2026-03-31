import type {
  OracleDecision,
  OracleEvaluationResult,
  SignedOracleAttestation,
} from "@padala-vision/shared";
import { env } from "../config/env.js";
import { buildAttestationV2Payload, signAttestationV2 } from "../lib/attestation.js";
import { GeminiVisionProvider } from "../providers/oracle/gemini.js";
import { StubVisionProvider } from "../providers/oracle/stub.js";
import type { VisionOracleProvider } from "../providers/oracle/types.js";
import { ContractRegistryService } from "./contract-registry.service.js";

export class OracleService {
  private provider: VisionOracleProvider;
  private providerMode: "stub" | "gemini";
  private readonly contractRegistryService: ContractRegistryService;

  constructor(provider?: VisionOracleProvider) {
    this.contractRegistryService = new ContractRegistryService();

    if (provider) {
      this.provider = provider;
      this.providerMode = "stub";
      return;
    }

    if (env.ORACLE_PROVIDER === "gemini") {
      this.provider = new GeminiVisionProvider();
      this.providerMode = "gemini";
      return;
    }

    if (env.ORACLE_PROVIDER === "stub") {
      this.provider = new StubVisionProvider();
      this.providerMode = "stub";
      return;
    }

    if (env.GEMINI_API_KEY) {
      this.provider = new GeminiVisionProvider();
      this.providerMode = "gemini";
      return;
    }

    this.provider = new StubVisionProvider();
    this.providerMode = "stub";
  }

  async evaluate(
    input: Parameters<VisionOracleProvider["evaluateDeliveryEvidence"]>[0],
  ): Promise<OracleEvaluationResult> {
    try {
      const result = await this.provider.evaluateDeliveryEvidence(input);
      return applyBusinessRules(result);
    } catch (error) {
      if (this.providerMode === "gemini") {
        const fallback: OracleEvaluationResult = {
          decision: "MANUAL_REVIEW",
          confidence: 0,
          fraudFlags: ["ORACLE_PROVIDER_FAILURE"],
          reason: error instanceof Error ? error.message : "Gemini oracle evaluation failed",
          attestation: null,
        };
        return fallback;
      }

      throw error;
    }
  }

  async signApproval(orderId: string, confidence: number): Promise<SignedOracleAttestation> {
    const contractSet = await this.contractRegistryService.resolveActiveContractSet();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 15 * 60 * 1000);

    const payload = buildAttestationV2Payload({
      orderId,
      confidence,
      issuedAt,
      expiresAt,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
    });

    return signAttestationV2(payload, env.ORACLE_SECRET_KEY ?? "");
  }

  getProviderMode() {
    return this.providerMode;
  }
}

function applyBusinessRules(result: OracleEvaluationResult): OracleEvaluationResult {
  if (Number.isNaN(result.confidence) || result.confidence < 0 || result.confidence > 1) {
    throw new Error("Oracle confidence was invalid");
  }

  if (result.confidence < env.ORACLE_CONFIDENCE_THRESHOLD && result.decision === "APPROVE") {
    return {
      ...result,
      decision: "MANUAL_REVIEW" satisfies OracleDecision,
      reason: `Confidence ${result.confidence.toFixed(2)} is below the release threshold.`,
      attestation: null,
    };
  }

  if (result.decision !== "APPROVE") {
    return {
      ...result,
      attestation: null,
    };
  }

  return result;
}
