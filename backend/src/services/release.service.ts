import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";
import {
  buildAttestationV2Payload,
  signAttestationV2,
  type AttestationV2Payload,
  type SignedAttestationV2,
} from "../lib/attestation.js";
import { ContractRegistryService } from "./contract-registry.service.js";

export class ReleaseService {
  constructor(private readonly contractRegistryService = new ContractRegistryService()) {}

  async createReleaseIntent(input: {
    actor: SessionActor;
    orderId: string;
    correlationId: string;
  }) {
    const order = await repository.getOrder(input.orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }
    if (order.status === "Disputed") {
      throw new HttpError(409, "Release is blocked while the order is disputed", "release_dispute_blocked");
    }
    if (order.status !== "Approved") {
      throw new HttpError(409, "Order is not in a releasable approved state", "release_invalid_state");
    }

    const actorWalletBinding = await repository.getActiveWalletBindingByUser(input.actor.userId);
    const actorWallet = actorWalletBinding?.walletAddress ?? null;
    const isOperator = input.actor.roles.includes("ops_reviewer") || input.actor.roles.includes("ops_admin");
    const isParticipant =
      actorWallet !== null &&
      [order.buyerWallet, order.sellerWallet, order.riderWallet].filter(Boolean).includes(actorWallet);

    if (!isOperator && !isParticipant) {
      throw new HttpError(403, "Release intent requires an authorized participant or operator", "release_forbidden");
    }

    const approvalContext = await repository.getLatestDecision(input.orderId);
    if (
      !approvalContext ||
      approvalContext.decision !== "APPROVE" ||
      !approvalContext.issuedAt ||
      !approvalContext.expiresAt
    ) {
      throw new HttpError(409, "Approved release context is unavailable", "release_approval_context_missing");
    }

    const approvalExpiryMillis = Date.parse(approvalContext.expiresAt);
    if (Number.isNaN(approvalExpiryMillis) || approvalExpiryMillis <= Date.now()) {
      throw new HttpError(410, "Approved release context has expired", "release_approval_context_expired");
    }

    const contractSet = await this.contractRegistryService.resolveActiveContractSet();
    if (order.contractId && order.contractId !== contractSet.contractId) {
      throw new HttpError(409, "Order contract does not match the active contract registry", "release_contract_mismatch");
    }

    const issuedAt = new Date();
    const expiresAt = new Date(
      Math.min(
        issuedAt.getTime() + env.ATTESTATION_TTL_SECONDS * 1000,
        approvalExpiryMillis,
      ),
    );

    const attestationPayload: AttestationV2Payload = buildAttestationV2Payload({
      orderId: input.orderId,
      confidence: approvalContext.confidence,
      issuedAt,
      expiresAt,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
    });
    const attestation = signAttestationV2(attestationPayload, env.ORACLE_SECRET_KEY ?? "");

    const releaseIntent = await repository.createReleaseIntent({
      id: randomUUID(),
      orderId: input.orderId,
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
      attestationNonce: attestation.nonce,
      attestationPayload: attestation,
      attestationSignature: attestation.signature,
      issuedAt: new Date(attestation.issuedAtSecs * 1000).toISOString(),
      expiresAt: new Date(attestation.expiresAtSecs * 1000).toISOString(),
      correlationId: input.correlationId,
    });

    return {
      release_intent_id: releaseIntent.id,
      order_id: input.orderId,
      contract_id: contractSet.contractId,
      network_passphrase: contractSet.networkPassphrase,
      rpc_url: contractSet.rpcUrl,
      method: "submit_release",
      attestation,
      args: {
        order_id: attestation.orderId,
        decision: attestation.decision,
        confidence_bps: attestation.confidenceBps,
        issued_at_secs: attestation.issuedAtSecs,
        expires_at_secs: attestation.expiresAtSecs,
        nonce: attestation.nonce,
        signature: attestation.signature,
        contract_id: attestation.contractId,
        environment: attestation.environment,
      },
      replay_key: attestation.nonce,
    };
  }

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
