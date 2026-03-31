import type {
  ActorRole,
  ActorSessionRecord,
  ActorStatus,
  ActorSummary,
  DurableOrderStatus,
  OrderActorRelation,
  OrderEventType,
  TokenType,
  WorkflowTransitionAction,
} from "../types/foundation.js";

export interface MonetaryAmountSummary {
  itemAmount: string;
  deliveryFee: string;
  totalAmount: string;
}

export interface WorkspaceOrderCard extends MonetaryAmountSummary {
  orderId: string;
  orderCode: string;
  status: DurableOrderStatus;
  sellerDisplayName: string;
  buyerDisplayName: string;
  riderDisplayName: string | null;
  lastEventType: OrderEventType;
  lastEventAt: string;
  dueAt: string | null;
  nextAction: WorkflowTransitionAction | null;
  hasActiveDispute: boolean;
  requiresManualReview: boolean;
}

export interface OrderTimelineEntry {
  id: string;
  type: OrderEventType;
  occurredAt: string;
  actorId: string | null;
  actorRole: ActorRole | null;
  note: string | null;
  metadata: Record<string, unknown>;
}

export type ProofAnalysisQuality = "clear" | "blurry" | "dark" | "low_confidence" | "analysis_unavailable";
export type ProofAnalysisConfidence = "high" | "medium" | "low" | "unavailable";

export interface ProofAnalysisResult {
  analysisStatus: "available" | "unavailable";
  summary: string | null;
  qualityAssessment: ProofAnalysisQuality;
  confidenceLabel: ProofAnalysisConfidence;
  riskFlags: string[];
  operatorNotes: string | null;
  decisionSuggestion?: string | null;
}

export interface OrderProofArtifact {
  imageUrl: string | null;
  storagePath: string | null;
  fileHash: string | null;
  contentType?: string | null;
  submittedAt: string;
  note: string | null;
  analysis?: ProofAnalysisResult | null;
}

export interface OrderDetailParticipantView extends MonetaryAmountSummary {
  orderId: string;
  orderCode: string;
  status: DurableOrderStatus;
  itemDescription: string;
  pickupLabel: string;
  dropoffLabel: string;
  seller: ActorSummary;
  buyer: ActorSummary;
  rider: ActorSummary | null;
  createdAt: string;
  updatedAt: string;
  fundingDeadlineAt: string;
  buyerConfirmationDueAt: string | null;
  lastEventType: OrderEventType;
  lastEventAt: string;
  relation: OrderActorRelation;
}

export interface OrderDetailEnvelope {
  order: OrderDetailParticipantView;
  timeline: OrderTimelineEntry[];
  availableActions: WorkflowTransitionAction[];
  latestProof?: OrderProofArtifact | null;
}

export interface SessionView {
  actor: ActorSummary;
  session: Pick<ActorSessionRecord, "id" | "status" | "issuedAt" | "expiresAt" | "lastSeenAt">;
  defaultRoute: string;
}

export interface EnterWorkspaceSessionRequest {
  role: ActorRole;
  workspaceCode: string;
  pin: string;
}

export interface EnterWorkspaceSessionResponse extends SessionView {}

export interface LogoutWorkspaceSessionResponse {
  ok: true;
}

export interface GetWorkspaceSessionResponse {
  session: SessionView | null;
}

export interface SellerCreateOrderRequest extends MonetaryAmountSummary {
  buyerDisplayName: string;
  buyerContactLabel?: string | null;
  itemDescription: string;
  pickupLabel: string;
  dropoffLabel: string;
  fundingDeadlineAt: string;
}

export interface IssuedTokenReference {
  type: TokenType;
  token: string;
  expiresAt: string;
  oneTimeUse: true;
}

export interface SellerCreateOrderResponse {
  order: OrderDetailEnvelope["order"];
  buyerInvite: IssuedTokenReference & { type: "buyer_invite" };
}

export interface SellerListOrdersResponse {
  needsFunding: WorkspaceOrderCard[];
  activeDelivery: WorkspaceOrderCard[];
  awaitingBuyerConfirmation: WorkspaceOrderCard[];
  needsAttention: WorkspaceOrderCard[];
  closed: WorkspaceOrderCard[];
}

export interface SellerOrderDetailResponse extends OrderDetailEnvelope {
  buyerInviteActive: boolean;
}

export interface SellerCancelOrderResponse {
  orderId: string;
  status: Extract<DurableOrderStatus, "cancelled">;
}

export interface SellerReissueBuyerInviteResponse {
  orderId: string;
  buyerInvite: IssuedTokenReference & { type: "buyer_invite" };
}

export interface BuyerClaimInviteRequest {
  token: string;
  pin: string;
  displayName?: string | null;
}

export interface BuyerClaimInviteResponse extends SessionView {
  workspaceCode: string;
  order: OrderDetailEnvelope["order"];
}

export interface BuyerListOrdersResponse {
  toFund: WorkspaceOrderCard[];
  inProgress: WorkspaceOrderCard[];
  needsYourConfirmation: WorkspaceOrderCard[];
  closed: WorkspaceOrderCard[];
}

export interface BuyerOrderDetailResponse extends OrderDetailEnvelope {
  confirmationTokenActive: boolean;
}

export interface BuyerCreateFundingIntentRequest {
  orderId: string;
}

export interface BuyerCreateFundingIntentResponse {
  orderId: string;
  actionType: "fund";
  method: string;
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  args: Record<string, unknown>;
  replayKey: string;
}

export interface BuyerConfirmFundingRequest {
  txHash: string;
  submittedWallet: string;
}

export interface BuyerConfirmFundingResponse {
  orderId: string;
  status: Extract<DurableOrderStatus, "funded">;
}

export interface BuyerReissueConfirmationResponse {
  orderId: string;
  deliveryConfirmation: IssuedTokenReference & { type: "delivery_confirmation" };
}

export interface RiderAvailableJobCard extends MonetaryAmountSummary {
  orderId: string;
  orderCode: string;
  pickupLabel: string;
  dropoffLabel: string;
  fundingConfirmedAt: string;
  dueAt: string | null;
}

export interface RiderListAvailableJobsResponse {
  jobs: RiderAvailableJobCard[];
}

export interface RiderListMyJobsResponse {
  jobs: WorkspaceOrderCard[];
}

export interface RiderJobDetailResponse extends OrderDetailEnvelope {}

export interface RiderAcceptJobResponse {
  orderId: string;
  status: Extract<DurableOrderStatus, "rider_assigned">;
}

export interface RiderPickupJobRequest {
  pickedUpAt: string;
}

export interface RiderPickupJobResponse {
  orderId: string;
  status: Extract<DurableOrderStatus, "in_transit">;
}

export interface RiderCreateProofUploadResponse {
  uploadUrl: string;
  storagePath: string;
  expiresAt: string;
  fileHash?: string | null;
  contentType?: string | null;
}

export interface RiderSubmitProofRequest {
  imageUrl: string;
  storagePath?: string | null;
  fileHash?: string | null;
  contentType?: string | null;
  note?: string | null;
  submittedAt: string;
}

export interface RiderSubmitProofResponse {
  orderId: string;
  status: Extract<DurableOrderStatus, "awaiting_buyer_confirmation" | "manual_review">;
  confirmationIssued: boolean;
  manualReviewRequired: boolean;
  latestProof?: OrderProofArtifact | null;
}

export interface DeliveryConfirmationViewResponse extends MonetaryAmountSummary {
  orderId: string;
  orderCode: string;
  sellerDisplayName: string;
  buyerDisplayName: string;
  riderDisplayName: string | null;
  status: Extract<DurableOrderStatus, "awaiting_buyer_confirmation">;
  proofSubmittedAt: string;
  confirmationExpiresAt: string;
  requiresPin: true;
  latestProof?: OrderProofArtifact | null;
  proofSummary?: string | null;
  aiRiskFlags?: string[];
  decisionSuggestion?: string | null;
}

export interface ApproveDeliveryConfirmationRequest {
  pin: string;
}

export interface ApproveDeliveryConfirmationResponse {
  orderId: string;
  status: Extract<DurableOrderStatus, "release_pending">;
}

export interface RejectDeliveryConfirmationRequest {
  pin: string;
  reasonCode: string;
  note?: string | null;
}

export interface RejectDeliveryConfirmationResponse {
  orderId: string;
  status: Extract<DurableOrderStatus, "dispute_open">;
  disputeId: string;
}

export interface OperatorQueueItem extends WorkspaceOrderCard {
  aiRiskFlags: string[];
  recommendedAction: WorkflowTransitionAction | null;
  aiSummary?: string | null;
  decisionSuggestion?: string | null;
}

export interface OperatorListReviewsResponse {
  manualReviewQueue: OperatorQueueItem[];
  overdueBuyerConfirmations: OperatorQueueItem[];
  settlementExceptions: OperatorQueueItem[];
}

export interface OperatorReviewDetailResponse extends OrderDetailEnvelope {
  aiSummary: string | null;
  aiRiskFlags: string[];
  decisionSuggestion?: string | null;
  proofSummary?: string | null;
}

export interface OperatorDisputeSummary {
  disputeId: string;
  orderId: string;
  orderCode: string;
  orderStatus: DurableOrderStatus;
  openedAt: string;
  sellerDisplayName: string;
  buyerDisplayName: string;
  riderDisplayName: string | null;
  aiRiskFlags: string[];
  aiSummary?: string | null;
  decisionSuggestion?: string | null;
}

export interface OperatorListDisputesResponse {
  disputes: OperatorDisputeSummary[];
}

export interface OperatorDisputeDetailResponse extends OrderDetailEnvelope {
  disputeId: string;
  disputeOpenedAt: string;
  aiSummary: string | null;
  aiRiskFlags: string[];
  decisionSuggestion?: string | null;
  proofSummary?: string | null;
}

export interface OperatorResolveDisputeRequest {
  resolution: "release" | "refund" | "reject_dispute";
  note?: string | null;
}

export interface OperatorResolveDisputeResponse {
  disputeId: string;
  orderId: string;
  status: Extract<DurableOrderStatus, "release_pending" | "refund_pending" | "awaiting_buyer_confirmation">;
}

export interface OperatorReissueConfirmationResponse {
  orderId: string;
  deliveryConfirmation: IssuedTokenReference & { type: "delivery_confirmation" };
}

export interface SharedOrderDetailResponse extends OrderDetailEnvelope {}
