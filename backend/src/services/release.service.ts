import { env } from "../config/env.js";
import {
  buildAttestationV2Payload,
  signAttestationV2,
  type AttestationV2Payload,
  type SignedAttestationV2,
} from "../lib/attestation.js";
import { ContractRegistryService } from "./contract-registry.service.js";

export class ReleaseService {
  constructor(private readonly contractRegistryService = new ContractRegistryService()) {}

  async createApprovalAttestation(input: {
    orderId: string;
    confidence: number;
    nonce?: string;
    issuedAt?: string | number | Date;
    expiresAt?: string | number | Date;
    environment?: "staging" | "pilot";
  }): Promise<SignedAttestationV2> {
    const contractSet = await this.contractRegistryService.resolveActiveContractSet(input.environment);
    const issuedAt = input.issuedAt ?? new Date();
    const expiresAt =
      input.expiresAt ??
      new Date(Date.now() + env.ATTESTATION_TTL_SECONDS * 1000);

    const payload: AttestationV2Payload = buildAttestationV2Payload({
      orderId: input.orderId,
      confidence: input.confidence,
      issuedAt,
      expiresAt,
      nonce: input.nonce,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
    });

    return signAttestationV2(payload, env.ORACLE_SECRET_KEY ?? "");
  }
}
