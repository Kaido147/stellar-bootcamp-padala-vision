import { randomUUID } from "node:crypto";
import { Networks, StrKey } from "@stellar/stellar-sdk";
import type {
  ActorRole,
  ActorSummary,
  ApproveDeliveryConfirmationResponse,
  BuyerClaimInviteRequest,
  BuyerClaimInviteResponse,
  BuyerConfirmFundingRequest,
  BuyerConfirmFundingResponse,
  BuyerCreateFundingIntentResponse,
  BuyerFundingTopUpResponse,
  BuyerListOrdersResponse,
  BuyerOrderDetailResponse,
  BuyerReissueConfirmationResponse,
  DeliveryConfirmationViewResponse,
  EnterWorkspaceSessionRequest,
  EnterWorkspaceSessionResponse,
  GetWorkspaceSessionResponse,
  OperatorDisputeDetailResponse,
  OperatorListDisputesResponse,
  OperatorListReviewsResponse,
  OperatorQueueItem,
  OperatorResolveDisputeRequest,
  OperatorResolveDisputeResponse,
  OperatorReviewDetailResponse,
  OperatorReissueConfirmationResponse,
  OrderDetailEnvelope,
  OrderDetailParticipantView,
  OrderProofArtifact,
  OrderTimelineEntry,
  RejectDeliveryConfirmationRequest,
  RejectDeliveryConfirmationResponse,
  RiderAcceptJobResponse,
  RiderCreateProofUploadResponse,
  RiderJobDetailResponse,
  RiderListAvailableJobsResponse,
  RiderListMyJobsResponse,
  RiderPickupJobRequest,
  RiderPickupJobResponse,
  RiderSubmitProofRequest,
  RiderSubmitProofResponse,
  SellerCancelOrderResponse,
  SellerCreateOrderIntentRequest,
  SellerCreateOrderRequest,
  SellerCreateOrderResponse,
  SellerListOrdersResponse,
  SellerOrderDetailResponse,
  SellerReissueBuyerInviteResponse,
  SessionView,
  SharedOrderDetailResponse,
  WorkspaceOrderCard,
} from "@padala-vision/shared";
import { getTransitionsFrom, resolveOrderActorRelation, type SessionActor } from "@padala-vision/shared";
import { env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";
import { foundationRepository, type StoredActorRecord, type WorkflowOrderRecord } from "../lib/foundation-repository.js";
import { hashOpaqueToken } from "../lib/foundation-security.js";
import { repository } from "../lib/repository.js";
import { ChainService } from "./chain.service.js";
import { ActorService } from "./actor.service.js";
import { ContractRegistryService } from "./contract-registry.service.js";
import { FundingTokenService, formatDisplayAmountFromBaseUnits } from "./funding-token.service.js";
import { SessionService } from "./session.service.js";
import { StateTransitionService } from "./state-transition.service.js";
import { StorageService } from "./storage.service.js";
import { TokenService } from "./token.service.js";
import { WorkflowAiService } from "./workflow-ai.service.js";
import { WorkspaceQueryService } from "./workspace-query.service.js";
import { parseTokenAmountToBaseUnits } from "@padala-vision/shared";

export class WorkflowApiService {
  constructor(
    private readonly actors = new ActorService(),
    private readonly sessions = new SessionService(),
    private readonly tokens = new TokenService(),
    private readonly transitions = new StateTransitionService(),
    private readonly workspaces = new WorkspaceQueryService(),
    private readonly contracts = new ContractRegistryService(),
    private readonly chain = new ChainService(),
    private readonly storage = new StorageService(),
    private readonly ai = new WorkflowAiService(),
    private readonly fundingTokens = new FundingTokenService(),
  ) {}

  async enterSession(input: EnterWorkspaceSessionRequest): Promise<EnterWorkspaceSessionResponse & { token: string }> {
    const verified = await this.actors.verifyWorkspaceCredentials(input);
    if (!verified.ok) {
      if (verified.lockedUntil) {
        throw new HttpError(423, `PIN entry is temporarily locked until ${verified.lockedUntil}`, "actor_pin_locked");
      }

      throw new HttpError(401, "Invalid workspace code or PIN", "actor_invalid_credentials");
    }

    const issued = await this.sessions.createSession(verified.actor.id);
    return {
      ...toSessionView(verified.actor, issued.session),
      token: issued.token,
    };
  }

  async logoutSession(token: string | null) {
    if (token) {
      await this.sessions.revokeSession(token);
    }

    return {
      ok: true as const,
    };
  }

  async getCurrentSession(token: string | null): Promise<GetWorkspaceSessionResponse> {
    if (!token) {
      return { session: null };
    }

    const context = await this.sessions.getSessionContext(token);
    if (!context) {
      return { session: null };
    }

    return {
      session: toSessionView(toPublicActorSummary(context.actorRecord), context.session),
    };
  }

  async createSellerOrderIntent(actor: SessionActor, input: SellerCreateOrderIntentRequest) {
    ensureRole(actor, "seller");
    validateParticipantWallet(input.sellerWallet, "Seller wallet is not a valid Stellar address");
    validateParticipantWallet(input.buyerWallet, "Buyer wallet is not a valid Stellar address");
    normalizeTotal(input.itemAmount, input.deliveryFee, input.totalAmount);
    const contractSet = await this.contracts.resolveActiveContractSet();
    const token = await this.fundingTokens.inspectToken({
      contractId: contractSet.tokenContractId,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
      sourceAddress: input.sellerWallet,
    });

    return {
      actionType: "create_order" as const,
      method: "create_order" as const,
      contractId: contractSet.contractId,
      tokenContractId: contractSet.tokenContractId,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
      tokenDecimals: token.decimals,
      args: {
        seller_wallet: input.sellerWallet,
        buyer_wallet: input.buyerWallet,
        item_amount: parseTokenAmountToBaseUnits(input.itemAmount, token.decimals).toString(),
        delivery_fee: parseTokenAmountToBaseUnits(input.deliveryFee, token.decimals).toString(),
        expires_at: toUnixSeconds(input.fundingDeadlineAt).toString(),
      },
    };
  }

  async createSellerOrder(actor: SessionActor, input: SellerCreateOrderRequest): Promise<SellerCreateOrderResponse> {
    ensureRole(actor, "seller");
    validateParticipantWallet(input.sellerWallet, "Seller wallet is not a valid Stellar address");
    validateParticipantWallet(input.buyerWallet, "Buyer wallet is not a valid Stellar address");
    if (input.submittedWallet !== input.sellerWallet) {
      throw new HttpError(422, "Submitted wallet must match the seller wallet used to create the order", "workflow_create_wallet_mismatch");
    }

    const totalAmount = normalizeTotal(input.itemAmount, input.deliveryFee, input.totalAmount);
    const contractSet = await this.contracts.resolveActiveContractSet();
    const verified = await this.chain.verifyCreateOrderTransaction({
      txHash: input.txHash,
      contractId: contractSet.contractId,
      submittedWallet: input.submittedWallet,
      sellerWallet: input.sellerWallet,
      buyerWallet: input.buyerWallet,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
    });

    if (verified.status !== "confirmed" || !verified.onChainOrderId) {
      throw new HttpError(409, "Create-order transaction is not confirmed on chain", "workflow_create_not_confirmed");
    }

    const existingTransaction = await repository.getTransactionByHash(input.txHash);
    if (existingTransaction) {
      const existingOrder = await foundationRepository.getWorkflowOrder(existingTransaction.orderId);
      if (existingOrder) {
        const invite = await this.tokens.issueToken({
          orderId: existingOrder.id,
          actorId: existingOrder.buyerActorId,
          type: "buyer_invite",
          createdByActorId: actor.actorId,
        });
        const detail = await this.getOrderDetailEnvelope(existingOrder.id, actor);
        return {
          order: detail.order,
          buyerInvite: {
            type: "buyer_invite",
            token: invite.token,
            expiresAt: invite.record.expiresAt,
            oneTimeUse: true,
          },
        };
      }
    }

    const pendingBuyer = await this.actors.createPendingBuyerActor({
      displayName: input.buyerDisplayName,
      contactLabel: input.buyerContactLabel ?? null,
      createdByActorId: actor.actorId,
    });

    const orderId = repository.generateOrderId();
    const issuedAt = new Date().toISOString();
    const order = await foundationRepository.createWorkflowOrder({
      id: orderId,
      publicOrderCode: generatePublicOrderCode(orderId),
      workflowStatus: "awaiting_funding",
      contractId: verified.contractId,
      onChainOrderId: verified.onChainOrderId,
      sellerWallet: input.sellerWallet,
      buyerWallet: input.buyerWallet,
      riderWallet: null,
      orderCreatedTxHash: input.txHash,
      fundingTxHash: null,
      fundingStatus: "not_started",
      lastChainReconciliationStatus: "order_created_confirmed",
      lastChainReconciledAt: issuedAt,
      lastChainError: null,
      sellerActorId: actor.actorId,
      buyerActorId: pendingBuyer.id,
      itemAmount: input.itemAmount,
      deliveryFee: input.deliveryFee,
      totalAmount,
      itemDescription: input.itemDescription,
      pickupLabel: input.pickupLabel,
      dropoffLabel: input.dropoffLabel,
      fundingDeadlineAt: input.fundingDeadlineAt,
      lastEventType: "buyer_invite_issued",
      lastEventAt: issuedAt,
    });

    await foundationRepository.createOrderTimelineEvent({
      orderId,
      type: "order_created",
      actorId: actor.actorId,
      actorRole: actor.role,
      note: "Seller created workflow order",
      occurredAt: issuedAt,
      metadata: {},
    });

    await foundationRepository.createOrderTimelineEvent({
      orderId,
      type: "order_created_on_chain",
      actorId: actor.actorId,
      actorRole: actor.role,
      note: `Soroban order ${verified.onChainOrderId} confirmed on chain`,
      occurredAt: issuedAt,
      metadata: {
        contractId: verified.contractId,
        onChainOrderId: verified.onChainOrderId,
        txHash: input.txHash,
      },
    });

    await foundationRepository.createOrderTimelineEvent({
      orderId,
      type: "buyer_invite_issued",
      actorId: actor.actorId,
      actorRole: actor.role,
      note: "Buyer invite issued",
      occurredAt: issuedAt,
      metadata: {},
    });

    await repository.createTransaction({
      orderId,
      txHash: input.txHash,
      txType: "workflow_create_order",
      txStatus: "confirmed",
    });

    const invite = await this.tokens.issueToken({
      orderId,
      actorId: pendingBuyer.id,
      type: "buyer_invite",
      createdByActorId: actor.actorId,
    });

    const detail = await this.getOrderDetailEnvelope(orderId, actor);

    return {
      order: detail.order,
      buyerInvite: {
        type: "buyer_invite",
        token: invite.token,
        expiresAt: invite.record.expiresAt,
        oneTimeUse: true,
      },
    };
  }

  async listSellerOrders(actor: SessionActor): Promise<SellerListOrdersResponse> {
    ensureRole(actor, "seller");
    const grouped = await this.workspaces.listSellerWorkspace(actor.actorId);
    return {
      needsFunding: await this.toWorkspaceCards(grouped.needsFunding, actor.role),
      activeDelivery: await this.toWorkspaceCards(grouped.activeDelivery, actor.role),
      awaitingBuyerConfirmation: await this.toWorkspaceCards(grouped.awaitingBuyerConfirmation, actor.role),
      needsAttention: await this.toWorkspaceCards(grouped.needsAttention, actor.role),
      closed: await this.toWorkspaceCards(grouped.closed, actor.role),
    };
  }

  async getSellerOrder(actor: SessionActor, orderId: string): Promise<SellerOrderDetailResponse> {
    ensureRole(actor, "seller");
    const detail = await this.getOrderDetailEnvelope(orderId, actor);
    const order = await foundationRepository.getWorkflowOrder(orderId);
    if (!order) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_not_found");
    }

    return {
      ...detail,
      buyerInviteActive: await foundationRepository.hasActiveOrderAccessToken(orderId, "buyer_invite", order.buyerActorId),
    };
  }

  async cancelSellerOrder(actor: SessionActor, orderId: string): Promise<SellerCancelOrderResponse> {
    ensureRole(actor, "seller");
    await this.transitions.transitionOrder({
      orderId,
      action: "seller_cancelled_order",
      actorRole: actor.role,
      actorId: actor.actorId,
      note: "Seller cancelled the order",
    });

    return {
      orderId,
      status: "cancelled",
    };
  }

  async reissueBuyerInvite(actor: SessionActor, orderId: string): Promise<SellerReissueBuyerInviteResponse> {
    ensureRole(actor, "seller");
    const order = await requireWorkflowOrder(orderId);
    if (order.workflowStatus !== "awaiting_funding") {
      throw new HttpError(409, "Buyer invite can only be reissued before funding", "workflow_invite_state_invalid");
    }

    const issuedAt = new Date().toISOString();
    const invite = await this.tokens.issueToken({
      orderId,
      actorId: order.buyerActorId,
      type: "buyer_invite",
      createdByActorId: actor.actorId,
    });

    await foundationRepository.updateWorkflowOrder(orderId, {
      lastEventType: "buyer_invite_issued",
      lastEventAt: issuedAt,
    });
    await foundationRepository.createOrderTimelineEvent({
      orderId,
      type: "buyer_invite_issued",
      actorId: actor.actorId,
      actorRole: actor.role,
      note: "Buyer invite reissued",
      occurredAt: issuedAt,
      metadata: {},
    });

    return {
      orderId,
      buyerInvite: {
        type: "buyer_invite",
        token: invite.token,
        expiresAt: invite.record.expiresAt,
        oneTimeUse: true,
      },
    };
  }

  async claimBuyerInvite(input: BuyerClaimInviteRequest): Promise<BuyerClaimInviteResponse & { token: string }> {
    const tokenRecord = await this.tokens.validateToken(input.token, "buyer_invite");
    if (!tokenRecord) {
      throw new HttpError(401, "Buyer invite token is invalid or expired", "buyer_invite_invalid");
    }

    const activated = await this.actors.activatePendingBuyerActor({
      actorId: tokenRecord.actorId,
      pin: input.pin,
      displayName: input.displayName ?? undefined,
    });

    await this.tokens.consumeToken(input.token, "buyer_invite");

    const now = new Date().toISOString();
    await foundationRepository.updateWorkflowOrder(tokenRecord.orderId, {
      lastEventType: "buyer_claimed",
      lastEventAt: now,
    });
    await foundationRepository.createOrderTimelineEvent({
      orderId: tokenRecord.orderId,
      type: "buyer_claimed",
      actorId: activated.actor.id,
      actorRole: "buyer",
      note: "Buyer claimed workspace access",
      occurredAt: now,
      metadata: {},
    });

    const issued = await this.sessions.createSession(activated.actor.id);
    const detail = await this.getOrderDetailEnvelope(tokenRecord.orderId, {
      sessionId: issued.session.id,
      actorId: activated.actor.id,
      role: "buyer",
      status: activated.actor.status,
    });

    return {
      ...toSessionView(activated.actor, issued.session),
      workspaceCode: activated.workspaceCode,
      order: detail.order,
      token: issued.token,
    };
  }

  async listBuyerOrders(actor: SessionActor): Promise<BuyerListOrdersResponse> {
    ensureRole(actor, "buyer");
    const grouped = await this.workspaces.listBuyerWorkspace(actor.actorId);
    return {
      toFund: await this.toWorkspaceCards(grouped.toFund, actor.role),
      inProgress: await this.toWorkspaceCards(grouped.inProgress, actor.role),
      needsYourConfirmation: await this.toWorkspaceCards(grouped.needsYourConfirmation, actor.role),
      closed: await this.toWorkspaceCards(grouped.closed, actor.role),
    };
  }

  async getBuyerOrder(actor: SessionActor, orderId: string): Promise<BuyerOrderDetailResponse> {
    ensureRole(actor, "buyer");
    const detail = await this.getOrderDetailEnvelope(orderId, actor);
    return {
      ...detail,
      confirmationTokenActive: await foundationRepository.hasActiveOrderAccessToken(orderId, "delivery_confirmation", actor.actorId),
    };
  }

  async createBuyerFundingIntent(actor: SessionActor, orderId: string): Promise<BuyerCreateFundingIntentResponse> {
    ensureRole(actor, "buyer");
    const order = await requireWorkflowOrder(orderId);
    if (order.buyerActorId !== actor.actorId) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_forbidden");
    }
    if (order.workflowStatus !== "awaiting_funding" && order.workflowStatus !== "funding_failed") {
      throw new HttpError(409, "Funding can only be prepared while awaiting funding or after a failed attempt", "workflow_funding_state_invalid");
    }
    if (!order.onChainOrderId) {
      throw new HttpError(409, "Workflow order is missing the on-chain order reference", "workflow_chain_order_missing");
    }

    const contractSet = await this.contracts.resolveActiveContractSet();
    const token = await this.fundingTokens.inspectToken({
      contractId: contractSet.tokenContractId,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
      sourceAddress: order.buyerWallet,
    });
    const actionIntent = await repository.createChainActionIntent({
      id: randomUUID(),
      orderId,
      actionType: "fund",
      actorUserId: `workflow:${actor.actorId}`,
      actorWallet: order.buyerWallet,
      actorRoles: [actor.role],
      contractId: order.contractId ?? contractSet.contractId,
      environment: contractSet.environment,
      method: "fund_order",
      args: {
        order_id: order.onChainOrderId,
        total_amount: parseTokenAmountToBaseUnits(order.totalAmount, token.decimals).toString(),
      },
      replayKey: randomUUID(),
      correlationId: `workflow-fund-intent:${orderId}:${Date.now()}`,
    });

    return {
      orderId,
      actionType: "fund",
      method: "fund_order",
      actionIntentId: actionIntent.id,
      contractId: order.contractId ?? contractSet.contractId,
      tokenContractId: contractSet.tokenContractId,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
      tokenDecimals: token.decimals,
      onChainOrderId: order.onChainOrderId,
      buyerWallet: order.buyerWallet,
      fundingStatus: order.fundingStatus,
      existingFundingTxHash: order.fundingTxHash,
      token,
      setup: {
        demoTopUpAvailable: Boolean(env.TOKEN_ADMIN_SECRET) && contractSet.networkPassphrase === Networks.TESTNET,
        xlmFriendbotUrl:
          contractSet.networkPassphrase === Networks.TESTNET
            ? `https://friendbot.stellar.org/?addr=${order.buyerWallet}`
            : null,
      },
      args: {
        order_id: order.onChainOrderId,
        total_amount: parseTokenAmountToBaseUnits(order.totalAmount, token.decimals).toString(),
      },
      replayKey: actionIntent.replayKey,
    };
  }

  async requestBuyerFundingTopUp(actor: SessionActor, orderId: string): Promise<BuyerFundingTopUpResponse> {
    ensureRole(actor, "buyer");
    const order = await requireWorkflowOrder(orderId);
    if (order.buyerActorId !== actor.actorId) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_forbidden");
    }
    if (order.workflowStatus !== "awaiting_funding" && order.workflowStatus !== "funding_failed") {
      throw new HttpError(409, "Test token top-up is only available before funding succeeds", "workflow_top_up_state_invalid");
    }
    if (!env.TOKEN_ADMIN_SECRET) {
      throw new HttpError(503, "Test token top-up is not configured on this backend", "workflow_token_top_up_unavailable");
    }

    const contractSet = await this.contracts.resolveActiveContractSet();
    const token = await this.fundingTokens.inspectToken({
      contractId: contractSet.tokenContractId,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
      sourceAddress: order.buyerWallet,
    });
    const amountNeededBaseUnits = parseTokenAmountToBaseUnits(order.totalAmount, token.decimals);
    const minted = await this.fundingTokens.mintBuyerTopUp({
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
      tokenContractId: contractSet.tokenContractId,
      adminSecret: env.TOKEN_ADMIN_SECRET,
      recipientWallet: order.buyerWallet,
      amountNeededBaseUnits,
    });

    return {
      orderId,
      status: minted.status,
      txHash: minted.txHash,
      token,
      mintedAmount: formatDisplayAmountFromBaseUnits(minted.mintedAmount, token.decimals),
      balanceAfter: formatDisplayAmountFromBaseUnits(minted.balanceAfter, token.decimals),
    };
  }

  async confirmBuyerFunding(actor: SessionActor, orderId: string, input: BuyerConfirmFundingRequest): Promise<BuyerConfirmFundingResponse> {
    ensureRole(actor, "buyer");
    const order = await requireWorkflowOrder(orderId);
    if (order.buyerActorId !== actor.actorId) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_forbidden");
    }
    if (!order.onChainOrderId) {
      throw new HttpError(409, "Workflow order is missing the on-chain order reference", "workflow_chain_order_missing");
    }
    if (input.submittedWallet !== order.buyerWallet) {
      throw new HttpError(422, "Submitted wallet did not match the buyer wallet on the order", "workflow_fund_wallet_mismatch");
    }

    const contractSet = await this.contracts.resolveActiveContractSet();
    const existingRecord = await repository.getChainActionRecordByTxHash(input.txHash);
    if (existingRecord) {
      if (existingRecord.orderId !== orderId || existingRecord.actionType !== "fund") {
        throw new HttpError(409, "Transaction hash is already associated with another workflow action", "workflow_fund_tx_conflict");
      }
      if (existingRecord.status === "confirmed" && order.workflowStatus === "funded" && order.fundingTxHash === input.txHash) {
        return {
          orderId,
          status: "funded",
          txHash: input.txHash,
          chainStatus: "confirmed",
        };
      }
      if (existingRecord.status === "failed" && order.workflowStatus === "funding_failed" && order.fundingTxHash === input.txHash) {
        return {
          orderId,
          status: "funding_failed",
          txHash: input.txHash,
          chainStatus: "failed",
        };
      }

      const verified = await this.chain.verifyOrderActionTransaction({
        txHash: input.txHash,
        orderId: order.onChainOrderId,
        contractId: existingRecord.contractId,
        method: "fund_order",
        submittedWallet: input.submittedWallet,
        rpcUrl: contractSet.rpcUrl,
        networkPassphrase: contractSet.networkPassphrase,
      });

      return this.applyWorkflowFundingVerification({
        actor,
        order,
        txHash: input.txHash,
        verifiedStatus: verified.status,
        contractId: existingRecord.contractId,
        chainLedger: verified.ledger ?? null,
        recordId: existingRecord.id,
        transactionAlreadyExists: true,
      });
    }

    if (!input.actionIntentId) {
      throw new HttpError(422, "Funding action intent is required for a new funding transaction", "workflow_fund_intent_required");
    }

    const actionIntent = await repository.getChainActionIntentById(input.actionIntentId);
    if (!actionIntent || actionIntent.orderId !== orderId || actionIntent.actionType !== "fund") {
      throw new HttpError(404, "Funding intent was not found for this order", "workflow_fund_intent_not_found");
    }

    const verified = await this.chain.verifyOrderActionTransaction({
      txHash: input.txHash,
      orderId: order.onChainOrderId,
      contractId: actionIntent.contractId,
      method: "fund_order",
      submittedWallet: input.submittedWallet,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
    });

    await repository.createTransaction({
      orderId,
      txHash: input.txHash,
      txType: "workflow_fund",
      txStatus: verified.status,
    });

    const record = await repository.createChainActionRecord({
      chainActionIntentId: actionIntent.id,
      orderId,
      actionType: "fund",
      txHash: input.txHash,
      submittedWallet: input.submittedWallet,
      contractId: actionIntent.contractId,
      status: verified.status,
      correlationId: `workflow-fund-confirm:${orderId}:${Date.now()}`,
      confirmedAt: verified.status === "confirmed" ? new Date().toISOString() : null,
      chainLedger: verified.ledger ?? null,
    });

    return this.applyWorkflowFundingVerification({
      actor,
      order,
      txHash: input.txHash,
      verifiedStatus: verified.status,
      contractId: actionIntent.contractId,
      chainLedger: verified.ledger ?? null,
      recordId: record.id,
      transactionAlreadyExists: true,
    });
  }

  private async applyWorkflowFundingVerification(input: {
    actor: SessionActor;
    order: WorkflowOrderRecord;
    txHash: string;
    verifiedStatus: "pending" | "confirmed" | "failed";
    contractId: string;
    chainLedger: number | null;
    recordId: string;
    transactionAlreadyExists: boolean;
  }): Promise<BuyerConfirmFundingResponse> {
    const now = new Date().toISOString();

    if (input.verifiedStatus === "pending") {
      const nextStatus = input.order.workflowStatus === "funding_pending" ? input.order.workflowStatus : "funding_pending";
      await foundationRepository.updateWorkflowOrder(input.order.id, {
        workflowStatus: nextStatus,
        fundingStatus: "pending",
        fundingTxHash: input.txHash,
        contractId: input.contractId,
        lastChainReconciliationStatus: "funding_pending",
        lastChainReconciledAt: now,
        lastChainError: null,
        lastEventType: "funding_submitted",
        lastEventAt: now,
      });

      if (input.order.workflowStatus !== "funding_pending") {
        await foundationRepository.createOrderTimelineEvent({
          orderId: input.order.id,
          type: "funding_submitted",
          actorId: input.actor.actorId,
          actorRole: input.actor.role,
          note: "Funding transaction submitted and awaiting confirmation",
          occurredAt: now,
          metadata: {
            txHash: input.txHash,
            contractId: input.contractId,
          },
        });
      }

      await repository.updateChainActionRecord(input.recordId, {
        status: "pending",
        confirmedAt: null,
        chainLedger: input.chainLedger,
        correlationId: `workflow-fund-pending:${input.order.id}:${Date.now()}`,
      });
      await repository.updateTransactionByHash(input.txHash, {
        txStatus: "pending",
      });

      return {
        orderId: input.order.id,
        status: "funding_pending",
        txHash: input.txHash,
        chainStatus: "pending",
      };
    }

    if (input.verifiedStatus === "failed") {
      await foundationRepository.updateWorkflowOrder(input.order.id, {
        workflowStatus: "funding_failed",
        fundingStatus: "failed",
        fundingTxHash: input.txHash,
        contractId: input.contractId,
        lastChainReconciliationStatus: "funding_failed",
        lastChainReconciledAt: now,
        lastChainError: "Funding transaction failed on chain",
        lastEventType: "funding_failed",
        lastEventAt: now,
      });
      await foundationRepository.createOrderTimelineEvent({
        orderId: input.order.id,
        type: "funding_failed",
        actorId: input.actor.actorId,
        actorRole: input.actor.role,
        note: "Funding transaction failed on chain",
        occurredAt: now,
        metadata: {
          txHash: input.txHash,
          contractId: input.contractId,
        },
      });
      await repository.updateChainActionRecord(input.recordId, {
        status: "failed",
        confirmedAt: null,
        chainLedger: input.chainLedger,
        correlationId: `workflow-fund-failed:${input.order.id}:${Date.now()}`,
      });
      await repository.updateTransactionByHash(input.txHash, {
        txStatus: "failed",
      });

      return {
        orderId: input.order.id,
        status: "funding_failed",
        txHash: input.txHash,
        chainStatus: "failed",
      };
    }

    await foundationRepository.updateWorkflowOrder(input.order.id, {
      workflowStatus: "funded",
      fundingStatus: "confirmed",
      fundingTxHash: input.txHash,
      contractId: input.contractId,
      lastChainReconciliationStatus: "funding_confirmed",
      lastChainReconciledAt: now,
      lastChainError: null,
      lastEventType: "funding_confirmed",
      lastEventAt: now,
    });
    await foundationRepository.createOrderTimelineEvent({
      orderId: input.order.id,
      type: "funding_confirmed",
      actorId: input.actor.actorId,
      actorRole: input.actor.role,
      note: "Funding transaction confirmed on chain",
      occurredAt: now,
      metadata: {
        txHash: input.txHash,
        contractId: input.contractId,
        chainLedger: input.chainLedger,
      },
    });
    await repository.updateChainActionRecord(input.recordId, {
      status: "confirmed",
      confirmedAt: now,
      chainLedger: input.chainLedger,
      correlationId: `workflow-fund-confirmed:${input.order.id}:${Date.now()}`,
    });
    await repository.updateTransactionByHash(input.txHash, {
      txStatus: "confirmed",
    });

    return {
      orderId: input.order.id,
      status: "funded",
      txHash: input.txHash,
      chainStatus: "confirmed",
    };
  }

  async reissueBuyerConfirmation(actor: SessionActor, orderId: string): Promise<BuyerReissueConfirmationResponse> {
    ensureRole(actor, "buyer");
    const order = await requireWorkflowOrder(orderId);
    if (order.buyerActorId !== actor.actorId) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_forbidden");
    }
    if (order.workflowStatus !== "awaiting_buyer_confirmation") {
      throw new HttpError(409, "Confirmation can only be reissued while awaiting buyer confirmation", "workflow_confirmation_state_invalid");
    }

    return this.issueDeliveryConfirmation(order, actor.actorId);
  }

  async listRiderAvailableJobs(actor: SessionActor): Promise<RiderListAvailableJobsResponse> {
    ensureRole(actor, "rider");
    const jobs = await this.workspaces.listRiderAvailableJobs();
    return {
      jobs: jobs.map((job) => ({
        orderId: job.id,
        orderCode: job.publicOrderCode,
        pickupLabel: job.pickupLabel,
        dropoffLabel: job.dropoffLabel,
        itemAmount: job.itemAmount,
        deliveryFee: job.deliveryFee,
        totalAmount: job.totalAmount,
        fundingConfirmedAt: job.lastEventAt,
        dueAt: job.riderAcceptDueAt ?? job.deliveryDueAt ?? null,
      })),
    };
  }

  async listRiderJobs(actor: SessionActor): Promise<RiderListMyJobsResponse> {
    ensureRole(actor, "rider");
    const jobs = await this.workspaces.listRiderAssignedJobs(actor.actorId);
    return {
      jobs: await this.toWorkspaceCards(jobs, actor.role),
    };
  }

  async getRiderJob(actor: SessionActor, orderId: string): Promise<RiderJobDetailResponse> {
    ensureRole(actor, "rider");
    const order = await requireWorkflowOrder(orderId);
    if (order.riderActorId !== actor.actorId) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_forbidden");
    }

    return this.getOrderDetailEnvelope(orderId, actor);
  }

  async acceptRiderJob(actor: SessionActor, orderId: string): Promise<RiderAcceptJobResponse> {
    ensureRole(actor, "rider");
    const order = await requireWorkflowOrder(orderId);
    if (order.workflowStatus !== "funded" || order.riderActorId) {
      throw new HttpError(409, "Only funded and unassigned jobs can be accepted", "workflow_rider_accept_invalid");
    }

    await this.transitions.transitionOrder({
      orderId,
      action: "rider_accepted_order",
      actorRole: actor.role,
      actorId: actor.actorId,
      note: "Rider accepted job",
      orderPatch: {
        riderActorId: actor.actorId,
      },
    });

    return {
      orderId,
      status: "rider_assigned",
    };
  }

  async pickupRiderJob(actor: SessionActor, orderId: string, input: RiderPickupJobRequest): Promise<RiderPickupJobResponse> {
    ensureRole(actor, "rider");
    const order = await requireWorkflowOrder(orderId);
    if (order.riderActorId !== actor.actorId) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_forbidden");
    }

    await this.transitions.transitionOrder({
      orderId,
      action: "rider_marked_pickup",
      actorRole: actor.role,
      actorId: actor.actorId,
      note: "Rider picked up parcel",
      metadata: {
        pickedUpAt: input.pickedUpAt,
      },
    });

    return {
      orderId,
      status: "in_transit",
    };
  }

  async uploadRiderProof(actor: SessionActor, orderId: string, file: Express.Multer.File | undefined): Promise<RiderCreateProofUploadResponse> {
    ensureRole(actor, "rider");
    const order = await requireWorkflowOrder(orderId);
    if (order.riderActorId !== actor.actorId) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_forbidden");
    }
    if (!file) {
      throw new HttpError(400, "Evidence file is required", "workflow_proof_file_required");
    }

    const result = await this.storage.uploadEvidenceFile({
      orderId,
      riderWallet: `demo:rider:${actor.actorId}`,
      fileName: file.originalname || "proof.jpg",
      contentType: file.mimetype || "image/jpeg",
      bytes: file.buffer,
    });

    return {
      uploadUrl: result.signedUrl,
      storagePath: result.storagePath,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      fileHash: result.fileHash,
      contentType: result.contentType,
    };
  }

  async submitRiderProof(actor: SessionActor, orderId: string, input: RiderSubmitProofRequest): Promise<RiderSubmitProofResponse> {
    ensureRole(actor, "rider");
    const order = await requireWorkflowOrder(orderId);
    if (order.riderActorId !== actor.actorId) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_forbidden");
    }

    const timeline = (await foundationRepository.listOrderTimelineEvents(orderId)).map(toTimelineEntry);
    const proofArtifact = (await this.hydrateProofArtifact({
      imageUrl: input.imageUrl,
      storagePath: input.storagePath ?? null,
      fileHash: input.fileHash ?? null,
      contentType: input.contentType ?? null,
      submittedAt: input.submittedAt,
      note: input.note ?? null,
      analysis: null,
    })) ?? {
      imageUrl: input.imageUrl,
      storagePath: input.storagePath ?? null,
      fileHash: input.fileHash ?? null,
      contentType: input.contentType ?? null,
      submittedAt: input.submittedAt,
      note: input.note ?? null,
      analysis: null,
    };
    const proofAnalysis = await this.ai.analyzeProof({
      order,
      timeline,
      proof: {
        imageUrl: proofArtifact.imageUrl,
        storagePath: proofArtifact.storagePath,
        fileHash: proofArtifact.fileHash,
        contentType: proofArtifact.contentType ?? null,
        submittedAt: proofArtifact.submittedAt,
        note: proofArtifact.note,
      },
    });
    const proofMetadata = buildProofMetadata({
      imageUrl: proofArtifact.imageUrl,
      storagePath: proofArtifact.storagePath,
      fileHash: proofArtifact.fileHash,
      contentType: proofArtifact.contentType ?? null,
      analysis: proofAnalysis,
    });

    await foundationRepository.createOrderTimelineEvent({
      orderId,
      type: "proof_uploaded",
      actorId: actor.actorId,
      actorRole: actor.role,
      note: input.note ?? "Rider uploaded proof metadata",
      occurredAt: input.submittedAt,
      metadata: proofMetadata,
    });

    if (input.note?.includes("manual_review")) {
      await this.transitions.transitionOrder({
        orderId,
        action: "system_flagged_proof_for_review",
        note: "Proof flagged for manual review",
      });

      return {
        orderId,
        status: "manual_review",
        confirmationIssued: false,
        manualReviewRequired: true,
        latestProof: {
          ...proofArtifact,
          analysis: proofAnalysis,
        },
      };
    }

    const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await this.transitions.transitionOrder({
      orderId,
      action: "rider_submitted_proof",
      actorRole: actor.role,
      actorId: actor.actorId,
      note: "Rider submitted proof",
      orderPatch: {
        buyerConfirmationDueAt: dueAt,
        deliveredAt: input.submittedAt,
      },
      metadata: proofMetadata,
    });

    await this.issueDeliveryConfirmation(await requireWorkflowOrder(orderId), actor.actorId);

    return {
      orderId,
      status: "awaiting_buyer_confirmation",
      confirmationIssued: true,
      manualReviewRequired: false,
      latestProof: {
        ...proofArtifact,
        analysis: proofAnalysis,
      },
    };
  }

  async viewConfirmation(token: string): Promise<DeliveryConfirmationViewResponse> {
    const tokenRecord = await this.tokens.validateToken(token, "delivery_confirmation");
    if (!tokenRecord) {
      throw new HttpError(401, "Confirmation token is invalid or expired", "confirmation_token_invalid");
    }

    const order = await requireWorkflowOrder(tokenRecord.orderId);
    if (order.workflowStatus !== "awaiting_buyer_confirmation") {
      throw new HttpError(409, "Order is not awaiting buyer confirmation", "workflow_confirmation_state_invalid");
    }

    const actors = await this.getParticipantActors(order);
    const timeline = (await foundationRepository.listOrderTimelineEvents(order.id)).map(toTimelineEntry);
    const latestProof = await this.hydrateLatestProof(timeline);
    const advice = await this.ai.buildConfirmationAdvice({
      order,
      timeline,
    });
    return {
      orderId: order.id,
      orderCode: order.publicOrderCode,
      sellerDisplayName: actors.seller.displayName,
      buyerDisplayName: actors.buyer.displayName,
      riderDisplayName: actors.rider?.displayName ?? null,
      itemAmount: order.itemAmount,
      deliveryFee: order.deliveryFee,
      totalAmount: order.totalAmount,
      status: "awaiting_buyer_confirmation",
      proofSubmittedAt: order.lastEventAt,
      confirmationExpiresAt: tokenRecord.expiresAt,
      requiresPin: true,
      latestProof,
      proofSummary: advice.summary,
      aiRiskFlags: advice.riskFlags,
      decisionSuggestion: advice.decisionSuggestion,
    };
  }

  async approveConfirmation(token: string, input: { pin: string }): Promise<ApproveDeliveryConfirmationResponse> {
    const tokenRecord = await this.tokens.validateToken(token, "delivery_confirmation");
    if (!tokenRecord) {
      throw new HttpError(401, "Confirmation token is invalid or expired", "confirmation_token_invalid");
    }

    const pinResult = await this.actors.verifyActorPinById(tokenRecord.actorId, input.pin);
    if (!pinResult.ok) {
      if (pinResult.lockedUntil) {
        throw new HttpError(423, `PIN entry is temporarily locked until ${pinResult.lockedUntil}`, "actor_pin_locked");
      }
      throw new HttpError(401, "Invalid confirmation PIN", "actor_pin_invalid");
    }

    await this.tokens.consumeToken(token, "delivery_confirmation");
    const order = await requireWorkflowOrder(tokenRecord.orderId);
    if (order.buyerActorId !== tokenRecord.actorId) {
      throw new HttpError(403, "Confirmation token does not match the owning buyer", "confirmation_actor_mismatch");
    }

    await this.transitions.transitionOrder({
      orderId: order.id,
      action: "buyer_approved_delivery",
      actorRole: "buyer",
      actorId: tokenRecord.actorId,
      note: "Buyer approved delivery",
      orderPatch: {
        buyerConfirmedAt: new Date().toISOString(),
      },
    });

    return {
      orderId: order.id,
      status: "release_pending",
    };
  }

  async rejectConfirmation(token: string, input: RejectDeliveryConfirmationRequest): Promise<RejectDeliveryConfirmationResponse> {
    const tokenRecord = await this.tokens.validateToken(token, "delivery_confirmation");
    if (!tokenRecord) {
      throw new HttpError(401, "Confirmation token is invalid or expired", "confirmation_token_invalid");
    }

    const pinResult = await this.actors.verifyActorPinById(tokenRecord.actorId, input.pin);
    if (!pinResult.ok) {
      if (pinResult.lockedUntil) {
        throw new HttpError(423, `PIN entry is temporarily locked until ${pinResult.lockedUntil}`, "actor_pin_locked");
      }
      throw new HttpError(401, "Invalid confirmation PIN", "actor_pin_invalid");
    }

    await this.tokens.consumeToken(token, "delivery_confirmation");
    const order = await requireWorkflowOrder(tokenRecord.orderId);
    const legacyOrder = await repository.getOrder(order.id);

    await this.transitions.transitionOrder({
      orderId: order.id,
      action: "buyer_rejected_delivery",
      actorRole: "buyer",
      actorId: tokenRecord.actorId,
      note: input.note ?? input.reasonCode,
      metadata: {
        reasonCode: input.reasonCode,
      },
    });

    const existingDispute = await repository.getOpenDisputeByOrderId(order.id);
    if (existingDispute) {
      return {
        orderId: order.id,
        status: "dispute_open",
        disputeId: existingDispute.id,
      };
    }

    const disputeId = randomUUID();
    const now = new Date().toISOString();
    await repository.createDispute({
      id: disputeId,
      orderId: order.id,
      actorUserId: tokenRecord.actorId,
      actorWallet: null,
      actorRoles: ["buyer"],
      frozenFromStatus: legacyOrder?.status ?? "Disputed",
      reasonCode: input.reasonCode,
      description: input.note ?? "Buyer rejected delivery confirmation",
      evidenceRefs: [],
      status: "open",
      correlationId: `workflow-${randomUUID()}`,
      lastActivityAt: now,
      resolution: null,
      resolutionReason: null,
      resolutionNote: null,
      resolvedByUserId: null,
      resolvedByWallet: null,
      resolvedByRoles: [],
      resolvedAt: null,
    });

    await repository.createDisputeEvent({
      disputeId,
      orderId: order.id,
      action: "opened",
      actorUserId: tokenRecord.actorId,
      actorWallet: null,
      actorRoles: ["buyer"],
      reason: input.reasonCode,
      note: input.note ?? null,
      resolution: null,
      correlationId: `workflow-${randomUUID()}`,
    });

    return {
      orderId: order.id,
      status: "dispute_open",
      disputeId,
    };
  }

  async listOperatorReviews(actor: SessionActor): Promise<OperatorListReviewsResponse> {
    ensureRole(actor, "operator");
    const queues = await this.workspaces.listOperatorQueues();
    return {
      manualReviewQueue: await this.toOperatorQueueItems(queues.manualReviewQueue),
      overdueBuyerConfirmations: await this.toOperatorQueueItems(queues.overdueBuyerConfirmations),
      settlementExceptions: await this.toOperatorQueueItems(queues.settlementExceptions),
    };
  }

  async getOperatorReview(actor: SessionActor, orderId: string): Promise<OperatorReviewDetailResponse> {
    ensureRole(actor, "operator");
    const detail = await this.getOrderDetailEnvelope(orderId, actor);
    const order = await requireWorkflowOrder(orderId);
    const advice = await this.ai.buildReviewAdvice({
      order,
      timeline: detail.timeline,
    });
    return {
      ...detail,
      aiSummary: advice.summary,
      aiRiskFlags: advice.riskFlags,
      decisionSuggestion: advice.decisionSuggestion,
      proofSummary: advice.summary,
    };
  }

  async listOperatorDisputes(actor: SessionActor): Promise<OperatorListDisputesResponse> {
    ensureRole(actor, "operator");
    const disputes = await repository.listDisputes();
    const items: OperatorListDisputesResponse["disputes"] = [];

    for (const dispute of disputes) {
      const order = await foundationRepository.getWorkflowOrder(dispute.orderId);
      if (!order || dispute.status !== "open") {
        continue;
      }
      const actors = await this.getParticipantActors(order);
      const timeline = (await foundationRepository.listOrderTimelineEvents(order.id)).map(toTimelineEntry);
      const advice = this.ai.buildQueuePreview({
        order,
        timeline,
        dispute,
      });
      items.push({
        disputeId: dispute.id,
        orderId: order.id,
        orderCode: order.publicOrderCode,
        orderStatus: order.workflowStatus,
        openedAt: dispute.createdAt,
        sellerDisplayName: actors.seller.displayName,
        buyerDisplayName: actors.buyer.displayName,
        riderDisplayName: actors.rider?.displayName ?? null,
        aiRiskFlags: advice.riskFlags,
        aiSummary: advice.summary,
        decisionSuggestion: advice.decisionSuggestion,
      });
    }

    return { disputes: items };
  }

  async getOperatorDispute(actor: SessionActor, disputeId: string): Promise<OperatorDisputeDetailResponse> {
    ensureRole(actor, "operator");
    const dispute = await repository.getDisputeById(disputeId);
    if (!dispute) {
      throw new HttpError(404, "Dispute not found", "workflow_dispute_not_found");
    }
    const detail = await this.getOrderDetailEnvelope(dispute.orderId, actor);
    const order = await requireWorkflowOrder(dispute.orderId);
    const advice = await this.ai.buildReviewAdvice({
      order,
      timeline: detail.timeline,
      dispute,
    });
    return {
      ...detail,
      disputeId: dispute.id,
      disputeOpenedAt: dispute.createdAt,
      aiSummary: advice.summary,
      aiRiskFlags: advice.riskFlags,
      decisionSuggestion: advice.decisionSuggestion,
      proofSummary: advice.summary,
    };
  }

  async resolveOperatorDispute(
    actor: SessionActor,
    disputeId: string,
    input: OperatorResolveDisputeRequest,
  ): Promise<OperatorResolveDisputeResponse> {
    ensureRole(actor, "operator");
    const dispute = await repository.getDisputeById(disputeId);
    if (!dispute || dispute.status !== "open") {
      throw new HttpError(404, "Open dispute not found", "workflow_dispute_not_found");
    }

    const action =
      input.resolution === "release"
        ? "operator_resolved_dispute_to_release"
        : input.resolution === "refund"
          ? "operator_resolved_dispute_to_refund"
          : "operator_rejected_dispute";

    const result = await this.transitions.transitionOrder({
      orderId: dispute.orderId,
      action,
      actorRole: "operator",
      actorId: actor.actorId,
      note: input.note ?? input.resolution,
    });

    const now = new Date().toISOString();
    await repository.updateDispute(dispute.id, {
      status: "resolved",
      lastActivityAt: now,
      resolution: input.resolution,
      resolutionReason: input.resolution,
      resolutionNote: input.note ?? null,
      resolvedByUserId: actor.actorId,
      resolvedByWallet: null,
      resolvedByRoles: ["operator"],
      resolvedAt: now,
      correlationId: `workflow-${randomUUID()}`,
    });

    await repository.createDisputeEvent({
      disputeId: dispute.id,
      orderId: dispute.orderId,
      action: "resolved",
      actorUserId: actor.actorId,
      actorWallet: null,
      actorRoles: ["operator"],
      reason: input.resolution,
      note: input.note ?? null,
      resolution: input.resolution,
      correlationId: `workflow-${randomUUID()}`,
    });

    return {
      disputeId: dispute.id,
      orderId: dispute.orderId,
      status: result.order.workflowStatus as OperatorResolveDisputeResponse["status"],
    };
  }

  async operatorReissueConfirmation(actor: SessionActor, orderId: string): Promise<OperatorReissueConfirmationResponse> {
    ensureRole(actor, "operator");
    const order = await requireWorkflowOrder(orderId);
    if (order.workflowStatus !== "awaiting_buyer_confirmation" && order.workflowStatus !== "manual_review") {
      throw new HttpError(409, "Confirmation can only be reissued from buyer confirmation or manual review", "workflow_confirmation_state_invalid");
    }

    return this.issueDeliveryConfirmation(order, actor.actorId);
  }

  async getSharedOrderDetail(actor: SessionActor, orderId: string): Promise<SharedOrderDetailResponse> {
    return this.getOrderDetailEnvelope(orderId, actor);
  }

  private async issueDeliveryConfirmation(order: WorkflowOrderRecord, createdByActorId: string) {
    const issuedAt = new Date().toISOString();
    const deliveryConfirmation = await this.tokens.issueToken({
      orderId: order.id,
      actorId: order.buyerActorId,
      type: "delivery_confirmation",
      createdByActorId,
    });

    await foundationRepository.updateWorkflowOrder(order.id, {
      lastEventType: "buyer_confirmation_token_issued",
      lastEventAt: issuedAt,
    });
    await foundationRepository.createOrderTimelineEvent({
      orderId: order.id,
      type: "buyer_confirmation_token_issued",
      actorId: createdByActorId,
      actorRole: createdByActorId === order.buyerActorId ? "buyer" : null,
      note: "Delivery confirmation token issued",
      occurredAt: issuedAt,
      metadata: {},
    });

    return {
      orderId: order.id,
      deliveryConfirmation: {
        type: "delivery_confirmation" as const,
        token: deliveryConfirmation.token,
        expiresAt: deliveryConfirmation.record.expiresAt,
        oneTimeUse: true as const,
      },
    };
  }

  private async getOrderDetailEnvelope(orderId: string, actor: SessionActor): Promise<OrderDetailEnvelope> {
    const order = await requireWorkflowOrder(orderId);
    const ownership = await foundationRepository.getWorkflowOrderOwnership(orderId);
    if (!ownership) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_not_found");
    }

    const relation = resolveOrderActorRelation({
      actor,
      ownership,
    });
    const actors = await this.getParticipantActors(order);
    const timeline = await foundationRepository.listOrderTimelineEvents(orderId);
    const timelineEntries = timeline.map(toTimelineEntry);

    return {
      order: {
        orderId: order.id,
        orderCode: order.publicOrderCode,
        status: order.workflowStatus,
        itemDescription: order.itemDescription,
        pickupLabel: order.pickupLabel,
        dropoffLabel: order.dropoffLabel,
        itemAmount: order.itemAmount,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        seller: actors.seller,
        buyer: actors.buyer,
        rider: actors.rider,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        fundingDeadlineAt: order.fundingDeadlineAt,
        buyerConfirmationDueAt: order.buyerConfirmationDueAt,
        lastEventType: order.lastEventType,
        lastEventAt: order.lastEventAt,
        relation,
        chain: {
          contractId: order.contractId,
          onChainOrderId: order.onChainOrderId,
          sellerWallet: order.sellerWallet,
          buyerWallet: order.buyerWallet,
          riderWallet: order.riderWallet,
          orderCreatedTxHash: order.orderCreatedTxHash,
          fundingTxHash: order.fundingTxHash,
          fundingStatus: order.fundingStatus,
          lastChainReconciliationStatus: order.lastChainReconciliationStatus,
          lastChainReconciledAt: order.lastChainReconciledAt,
          lastChainError: order.lastChainError,
        },
      } satisfies OrderDetailParticipantView,
      timeline: timelineEntries,
      availableActions: getTransitionsFrom(order.workflowStatus)
        .filter((transition) => transition.allowedRoles.some((allowedRole) => allowedRole === actor.role))
        .map((transition) => transition.action),
      latestProof: await this.hydrateLatestProof(timelineEntries),
    };
  }

  private async toWorkspaceCards(orders: WorkflowOrderRecord[], actorRole: ActorRole) {
    const summaries = await this.getActorSummaryMap(orders);
    const cards: WorkspaceOrderCard[] = [];

    for (const order of orders) {
      const seller = requireActorSummary(summaries.get(order.sellerActorId));
      const buyer = requireActorSummary(summaries.get(order.buyerActorId));
      const rider = order.riderActorId ? summaries.get(order.riderActorId) ?? null : null;
      const openDispute = await repository.getOpenDisputeByOrderId(order.id);
      const nextAction = getTransitionsFrom(order.workflowStatus)
        .find((transition) => transition.allowedRoles.some((allowedRole) => allowedRole === actorRole))
        ?.action ?? null;

      cards.push({
        orderId: order.id,
        orderCode: order.publicOrderCode,
        status: order.workflowStatus,
        sellerDisplayName: seller.displayName,
        buyerDisplayName: buyer.displayName,
        riderDisplayName: rider?.displayName ?? null,
        itemAmount: order.itemAmount,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        lastEventType: order.lastEventType,
        lastEventAt: order.lastEventAt,
        dueAt: order.buyerConfirmationDueAt ?? order.riderAcceptDueAt ?? order.deliveryDueAt ?? order.fundingDeadlineAt,
        nextAction,
        hasActiveDispute: Boolean(openDispute),
        requiresManualReview: order.workflowStatus === "manual_review",
      });
    }

    return cards;
  }

  private async toOperatorQueueItems(orders: WorkflowOrderRecord[]): Promise<OperatorQueueItem[]> {
    const cards = await this.toWorkspaceCards(orders, "operator");
    return Promise.all(
      cards.map(async (card) => {
        const order = await requireWorkflowOrder(card.orderId);
        const timeline = (await foundationRepository.listOrderTimelineEvents(card.orderId)).map(toTimelineEntry);
        const advice = this.ai.buildQueuePreview({
          order,
          timeline,
          dispute: (await repository.getOpenDisputeByOrderId(card.orderId)) ?? null,
        });

        return {
          ...card,
          aiRiskFlags: advice.riskFlags,
          aiSummary: advice.summary,
          decisionSuggestion: advice.decisionSuggestion,
          recommendedAction: card.nextAction,
        };
      }),
    );
  }

  private async getParticipantActors(order: WorkflowOrderRecord) {
    const summaryMap = await this.getActorSummaryMap([order]);
    return {
      seller: requireActorSummary(summaryMap.get(order.sellerActorId)),
      buyer: requireActorSummary(summaryMap.get(order.buyerActorId)),
      rider: order.riderActorId ? summaryMap.get(order.riderActorId) ?? null : null,
    };
  }

  private async getActorSummaryMap(orders: WorkflowOrderRecord[]) {
    const actorIds = [...new Set(orders.flatMap((order) => [order.sellerActorId, order.buyerActorId, order.riderActorId].filter(Boolean) as string[]))];
    const actors = await foundationRepository.getActorsByIds(actorIds);
    return new Map<string, ActorSummary>(actors.map((actor) => [actor.id, toPublicActorSummary(actor)]));
  }

  private async hydrateLatestProof(timeline: OrderTimelineEntry[]) {
    const latest = extractLatestProof(timeline);
    return this.hydrateProofArtifact(latest);
  }

  private async hydrateProofArtifact(proof: OrderProofArtifact | null): Promise<OrderProofArtifact | null> {
    if (!proof) {
      return null;
    }

    const renderUrl = proof.storagePath
      ? await this.storage.getEvidenceRenderUrl(proof.storagePath)
      : proof.imageUrl;

    return {
      ...proof,
      imageUrl: renderUrl ?? proof.imageUrl,
    };
  }
}

function toSessionView(
  actor: ActorSummary | StoredActorRecord,
  session: {
    id: string;
    status: SessionView["session"]["status"];
    issuedAt: string;
    expiresAt: string;
    lastSeenAt: string;
  },
): SessionView {
  return {
    actor: "displayName" in actor && "role" in actor && "status" in actor
      ? {
          id: actor.id,
          role: actor.role,
          status: actor.status,
          displayName: actor.displayName,
        }
      : actor,
    session: {
      id: session.id,
      status: session.status,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
    },
    defaultRoute: getDefaultRoute(("role" in actor ? actor.role : "seller") as ActorRole),
  };
}

function toPublicActorSummary(actor: StoredActorRecord): ActorSummary {
  return {
    id: actor.id,
    role: actor.role,
    status: actor.status,
    displayName: actor.displayName,
  };
}

function toTimelineEntry(event: OrderTimelineEntry | Awaited<ReturnType<typeof foundationRepository.listOrderTimelineEvents>>[number]): OrderTimelineEntry {
  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    actorId: event.actorId,
    actorRole: event.actorRole,
    note: event.note,
    metadata: event.metadata,
  };
}

function extractLatestProof(timeline: OrderTimelineEntry[]) {
  const latest = [...timeline]
    .reverse()
    .find((entry) => entry.type === "proof_submitted" || entry.type === "proof_uploaded");

  if (!latest) {
    return null;
  }

  return {
    imageUrl: readMetadataString(latest.metadata.imageUrl),
    storagePath: readMetadataString(latest.metadata.storagePath),
    fileHash: readMetadataString(latest.metadata.fileHash),
    contentType: readMetadataString(latest.metadata.contentType),
    submittedAt: latest.occurredAt,
    note: latest.note,
    analysis: extractProofAnalysis(latest.metadata),
  };
}

function extractProofAnalysis(metadata: Record<string, unknown>) {
  const analysisStatus = readMetadataString(metadata.analysisStatus);
  const summary = readMetadataString(metadata.aiSummary);
  const qualityAssessment = readMetadataString(metadata.aiQualityAssessment);
  const confidenceLabel = readMetadataString(metadata.aiConfidenceLabel);
  const operatorNotes = readMetadataString(metadata.aiOperatorNotes);
  const decisionSuggestion = readMetadataString(metadata.aiDecisionSuggestion);
  const riskFlags = Array.isArray(metadata.aiRiskFlags)
    ? metadata.aiRiskFlags.filter((flag): flag is string => typeof flag === "string" && flag.trim().length > 0)
    : [];

  if (!analysisStatus && !summary && !qualityAssessment && !confidenceLabel && !operatorNotes && riskFlags.length === 0) {
    return null;
  }

  return {
    analysisStatus: analysisStatus === "available" ? "available" : "unavailable",
    summary,
    qualityAssessment:
      qualityAssessment === "clear" ||
      qualityAssessment === "blurry" ||
      qualityAssessment === "dark" ||
      qualityAssessment === "low_confidence"
        ? qualityAssessment
        : "analysis_unavailable",
    confidenceLabel:
      confidenceLabel === "high" || confidenceLabel === "medium" || confidenceLabel === "low"
        ? confidenceLabel
        : "unavailable",
    riskFlags,
    operatorNotes,
    decisionSuggestion,
  } satisfies NonNullable<OrderProofArtifact["analysis"]>;
}

function buildProofMetadata(input: {
  imageUrl: string | null;
  storagePath: string | null;
  fileHash: string | null;
  contentType: string | null;
  analysis: NonNullable<OrderProofArtifact["analysis"]>;
}) {
  return {
    imageUrl: input.imageUrl,
    storagePath: input.storagePath,
    fileHash: input.fileHash,
    contentType: input.contentType,
    analysisStatus: input.analysis.analysisStatus,
    aiSummary: input.analysis.summary,
    aiQualityAssessment: input.analysis.qualityAssessment,
    aiConfidenceLabel: input.analysis.confidenceLabel,
    aiRiskFlags: input.analysis.riskFlags,
    aiOperatorNotes: input.analysis.operatorNotes,
    aiDecisionSuggestion: input.analysis.decisionSuggestion ?? null,
  };
}

function ensureRole(actor: SessionActor, role: ActorRole) {
  if (actor.role !== role) {
    throw new HttpError(403, "Actor role is not allowed for this endpoint", "workflow_actor_role_forbidden");
  }
}

function requireActorSummary(summary: ActorSummary | undefined): ActorSummary {
  if (!summary) {
    throw new HttpError(500, "Workflow actor summary is missing", "workflow_actor_summary_missing");
  }
  return summary;
}

function readMetadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

async function requireWorkflowOrder(orderId: string) {
  const order = await foundationRepository.getWorkflowOrder(orderId);
  if (!order) {
    throw new HttpError(404, "Workflow order not found", "workflow_order_not_found");
  }
  return order;
}

function normalizeTotal(itemAmount: string, deliveryFee: string, totalAmount: string) {
  const nextTotal = (Number(itemAmount) + Number(deliveryFee)).toFixed(2);
  if (Number(totalAmount).toFixed(2) !== nextTotal) {
    throw new HttpError(422, "totalAmount must equal itemAmount + deliveryFee", "workflow_total_mismatch");
  }
  return nextTotal;
}

function validateParticipantWallet(wallet: string, message: string) {
  if (!StrKey.isValidEd25519PublicKey(wallet.trim())) {
    throw new HttpError(422, message, "workflow_wallet_invalid");
  }
}

function toUnixSeconds(value: string) {
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    throw new HttpError(422, "Funding deadline must be a valid datetime", "workflow_deadline_invalid");
  }
  return Math.floor(millis / 1000);
}

function getDefaultRoute(role: ActorRole) {
  switch (role) {
    case "seller":
      return "/seller";
    case "buyer":
      return "/buyer";
    case "rider":
      return "/rider/jobs";
    case "operator":
      return "/operator/reviews";
  }
}

function generatePublicOrderCode(orderId: string) {
  const suffix = orderId.slice(-6).toUpperCase();
  return `PV-${suffix}`;
}
