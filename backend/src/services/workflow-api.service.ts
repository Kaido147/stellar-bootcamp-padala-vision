import { randomUUID } from "node:crypto";
import type {
  ActorRole,
  ActorSummary,
  ApproveDeliveryConfirmationResponse,
  BuyerClaimInviteRequest,
  BuyerClaimInviteResponse,
  BuyerConfirmFundingRequest,
  BuyerConfirmFundingResponse,
  BuyerCreateFundingIntentResponse,
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
import { ActorService } from "./actor.service.js";
import { ContractRegistryService } from "./contract-registry.service.js";
import { SessionService } from "./session.service.js";
import { StateTransitionService } from "./state-transition.service.js";
import { StorageService } from "./storage.service.js";
import { TokenService } from "./token.service.js";
import { WorkflowAiService } from "./workflow-ai.service.js";
import { WorkspaceQueryService } from "./workspace-query.service.js";

export class WorkflowApiService {
  constructor(
    private readonly actors = new ActorService(),
    private readonly sessions = new SessionService(),
    private readonly tokens = new TokenService(),
    private readonly transitions = new StateTransitionService(),
    private readonly workspaces = new WorkspaceQueryService(),
    private readonly contracts = new ContractRegistryService(),
    private readonly storage = new StorageService(),
    private readonly ai = new WorkflowAiService(),
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

  async createSellerOrder(actor: SessionActor, input: SellerCreateOrderRequest): Promise<SellerCreateOrderResponse> {
    ensureRole(actor, "seller");
    const totalAmount = normalizeTotal(input.itemAmount, input.deliveryFee, input.totalAmount);
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
      type: "buyer_invite_issued",
      actorId: actor.actorId,
      actorRole: actor.role,
      note: "Buyer invite issued",
      occurredAt: issuedAt,
      metadata: {},
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
    if (order.workflowStatus !== "awaiting_funding") {
      throw new HttpError(409, "Only awaiting-funding orders can create a funding intent", "workflow_funding_state_invalid");
    }

    const contractSet = await this.contracts.resolveActiveContractSet();
    return {
      orderId,
      actionType: "fund",
      method: "fund_order",
      contractId: contractSet.contractId,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
      args: {
        order_id: orderId,
        total_amount: order.totalAmount,
      },
      replayKey: randomUUID(),
    };
  }

  async confirmBuyerFunding(actor: SessionActor, orderId: string, input: BuyerConfirmFundingRequest): Promise<BuyerConfirmFundingResponse> {
    ensureRole(actor, "buyer");
    const order = await requireWorkflowOrder(orderId);
    if (order.buyerActorId !== actor.actorId) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_forbidden");
    }

    await repository.createTransaction({
      orderId,
      txHash: input.txHash,
      txType: "workflow_fund",
      txStatus: "confirmed",
    });

    await this.transitions.transitionOrder({
      orderId,
      action: "buyer_confirmed_funding",
      actorRole: actor.role,
      actorId: actor.actorId,
      note: "Buyer confirmed escrow funding",
    });

    return {
      orderId,
      status: "funded",
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
