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
import { ChainService } from "./chain.service.js";
import { ContractRegistryService } from "./contract-registry.service.js";

export class ReleaseService {
  constructor(
    private readonly contractRegistryService = new ContractRegistryService(),
    private readonly chainService = new ChainService(),
  ) {}

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

  async recordRelease(input: {
    actor: SessionActor;
    orderId: string;
    txHash: string;
    attestationNonce: string;
    submittedWallet: string;
    correlationId: string;
    allowDisputedResolution?: boolean;
  }) {
    const order = await repository.getOrder(input.orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }

    const existingReleaseRecord = await repository.getReleaseRecordByTxHash(input.txHash);
    if (existingReleaseRecord) {
      return this.replayExistingReleaseRecord(existingReleaseRecord, input.orderId);
    }

    if (order.status === "Released") {
      throw new HttpError(409, "Order has already been released", "release_already_recorded");
    }
    if (order.status === "Disputed" && !input.allowDisputedResolution) {
      throw new HttpError(409, "Disputed orders cannot be finalized as released", "release_dispute_blocked");
    }

    const actorWalletBinding = await repository.getActiveWalletBindingByUser(input.actor.userId);
    const actorWallet = actorWalletBinding?.walletAddress ?? null;
    const isOperator = input.actor.roles.includes("ops_reviewer") || input.actor.roles.includes("ops_admin");
    const isParticipant =
      actorWallet !== null &&
      [order.buyerWallet, order.sellerWallet, order.riderWallet].filter(Boolean).includes(actorWallet);

    if (!actorWallet || actorWallet !== input.submittedWallet) {
      throw new HttpError(403, "Submitted wallet must match the authenticated bound wallet", "release_wallet_mismatch");
    }
    if (!isOperator && !isParticipant) {
      throw new HttpError(403, "Release recording requires an authorized participant or operator", "release_forbidden");
    }

    const releaseIntent = await repository.getReleaseIntentByNonce(input.orderId, input.attestationNonce);
    if (!releaseIntent) {
      throw new HttpError(404, "Release intent was not found for this order and nonce", "release_intent_not_found");
    }
    if (Date.parse(releaseIntent.expiresAt) <= Date.now()) {
      throw new HttpError(410, "Release intent has expired", "release_intent_expired");
    }

    const existingTransaction = await repository.getTransactionByHash(input.txHash);
    if (existingTransaction) {
      throw new HttpError(409, "Release transaction hash has already been recorded", "release_tx_hash_conflict");
    }

    const verifiedTx = await this.chainService.verifyReleaseTransaction({
      txHash: input.txHash,
      orderId: input.orderId,
      contractId: releaseIntent.contractId,
      attestationNonce: input.attestationNonce,
      submittedWallet: input.submittedWallet,
    });

    if (
      verifiedTx.orderId !== input.orderId ||
      verifiedTx.contractId !== releaseIntent.contractId ||
      verifiedTx.attestationNonce !== input.attestationNonce
    ) {
      throw new HttpError(422, "Release transaction does not match the persisted release intent", "release_tx_mismatch");
    }

    const releaseRecord = await repository.createReleaseRecord({
      releaseIntentId: releaseIntent.id,
      orderId: input.orderId,
      txHash: input.txHash,
      attestationNonce: input.attestationNonce,
      submittedWallet: input.submittedWallet,
      contractId: releaseIntent.contractId,
      status: verifiedTx.status,
      correlationId: input.correlationId,
      confirmedAt: verifiedTx.status === "confirmed" ? new Date().toISOString() : null,
      chainLedger: verifiedTx.ledger ?? null,
    });

    if (verifiedTx.status === "pending") {
      return {
        release_status: "pending_confirmation" as const,
        chain_status: verifiedTx.status,
        financial_finality: false,
        order,
        tx: null,
        release_record_id: releaseRecord.id,
      };
    }

    if (verifiedTx.status === "failed") {
      throw new HttpError(409, "Release transaction failed on-chain", "release_tx_failed");
    }

    const tx = await repository.createTransaction({
      orderId: input.orderId,
      txHash: input.txHash,
      txType: "release",
      txStatus: "confirmed",
    });

    const releasedOrder = await repository.updateOrderStatus(
      input.orderId,
      "Released",
      "Release transaction confirmed on-chain",
      {
        releasedAt: new Date().toISOString(),
      },
    );

    await repository.updateReleaseRecord(releaseRecord.id, {
      status: "confirmed",
      confirmedAt: releasedOrder.releasedAt,
      chainLedger: verifiedTx.ledger ?? null,
      correlationId: input.correlationId,
    });

    return {
      release_status: "confirmed" as const,
      chain_status: verifiedTx.status,
      financial_finality: true,
      order: releasedOrder,
      tx,
      release_record_id: releaseRecord.id,
    };
  }

  private async replayExistingReleaseRecord(existingReleaseRecord: Awaited<ReturnType<typeof repository.getReleaseRecordByTxHash>>, orderId: string) {
    if (!existingReleaseRecord) {
      throw new HttpError(500, "Release record replay failed", "release_replay_failed");
    }

    if (existingReleaseRecord.orderId !== orderId) {
      throw new HttpError(409, "Release transaction hash is already associated with another order", "release_tx_hash_conflict");
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }

    if (existingReleaseRecord.status === "pending") {
      return {
        release_status: "pending_confirmation" as const,
        chain_status: "pending" as const,
        financial_finality: false,
        order,
        tx: null,
        release_record_id: existingReleaseRecord.id,
      };
    }

    if (existingReleaseRecord.status === "failed") {
      throw new HttpError(409, "Release transaction failed on-chain", "release_tx_failed");
    }

    const tx = await repository.getTransactionByHash(existingReleaseRecord.txHash);
    return {
      release_status: "confirmed" as const,
      chain_status: "confirmed" as const,
      financial_finality: true,
      order,
      tx,
      release_record_id: existingReleaseRecord.id,
    };
  }
}
