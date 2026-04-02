import type {
  ApproveDeliveryConfirmationRequest,
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
  LogoutWorkspaceSessionResponse,
  OperatorDisputeDetailResponse,
  OperatorListDisputesResponse,
  OperatorListReviewsResponse,
  OperatorResolveDisputeRequest,
  OperatorResolveDisputeResponse,
  OperatorReviewDetailResponse,
  OperatorReissueConfirmationResponse,
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
  SellerCreateOrderIntentResponse,
  SellerCreateOrderRequest,
  SellerCreateOrderResponse,
  SellerListOrdersResponse,
  SellerOrderDetailResponse,
  SellerReissueBuyerInviteResponse,
  SharedOrderDetailResponse,
} from "@padala-vision/shared";
import { waitForAuthBootstrap } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
export const WORKFLOW_SESSION_INVALID_EVENT = "padala:workflow-session-invalid";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function createIdempotencyHeaders(...parts: Array<string | null | undefined>) {
  return {
    "Idempotency-Key": parts
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(":"),
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortValue((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

function dispatchWorkflowSessionInvalid(error: ApiError) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(WORKFLOW_SESSION_INVALID_EVENT, {
      detail: {
        message: error.message,
        code: error.code,
      },
    }),
  );
}

async function parseResponse<T>(
  response: Response,
  options?: {
    onUnauthorized?: (error: ApiError) => void;
  },
): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new ApiError(
      typeof body.error === "string" ? body.error : `Request failed with ${response.status}`,
      response.status,
      typeof body.code === "string" ? body.code : undefined,
    );
    if (response.status === 401) {
      options?.onUnauthorized?.(error);
    }
    throw error;
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

async function workflowRequest<T>(
  path: string,
  init?: RequestInit,
  options?: {
    invalidateSessionOnUnauthorized?: boolean;
  },
): Promise<T> {
  const headers =
    init?.body instanceof FormData
      ? new Headers(init.headers)
      : new Headers({
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        });

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  return parseResponse<T>(response, {
    onUnauthorized: options?.invalidateSessionOnUnauthorized ? dispatchWorkflowSessionInvalid : undefined,
  });
}

async function legacyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const authState = await waitForAuthBootstrap();

  if (!authState.accessToken) {
    const detail =
      authState.authError ??
      "no Supabase access token is available after auth bootstrap. Check the dev auth env settings.";
    throw new ApiError(detail, 401, "AUTH_TOKEN_MISSING");
  }

  const headers =
    init?.body instanceof FormData
      ? new Headers(init.headers)
      : new Headers({
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        });

  headers.set("Authorization", `Bearer ${authState.accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  return parseResponse<T>(response);
}

export const workflowApi = {
  getWorkflowSession: () => workflowRequest<GetWorkspaceSessionResponse>("/session/me"),
  enterWorkflowSession: (payload: EnterWorkspaceSessionRequest) =>
    workflowRequest<EnterWorkspaceSessionResponse>("/session/enter", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logoutWorkflowSession: () =>
    workflowRequest<LogoutWorkspaceSessionResponse>("/session/logout", {
      method: "POST",
    }),
  claimBuyerInvite: (payload: BuyerClaimInviteRequest) =>
    workflowRequest<BuyerClaimInviteResponse>("/buyer/invite/claim", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createSellerWorkflowOrderIntent: (payload: SellerCreateOrderIntentRequest) =>
    workflowRequest<SellerCreateOrderIntentResponse>("/seller/orders/create-intent", {
      method: "POST",
      headers: createIdempotencyHeaders("workflow-create-order-intent", stableStringify(payload)),
      body: JSON.stringify(payload),
    }, { invalidateSessionOnUnauthorized: true }),
  createSellerWorkflowOrder: (payload: SellerCreateOrderRequest) =>
    workflowRequest<SellerCreateOrderResponse>("/seller/orders", {
      method: "POST",
      headers: createIdempotencyHeaders("workflow-create-order", payload.txHash),
      body: JSON.stringify(payload),
    }, { invalidateSessionOnUnauthorized: true }),
  listSellerWorkflowOrders: () => workflowRequest<SellerListOrdersResponse>("/seller/orders", undefined, { invalidateSessionOnUnauthorized: true }),
  getSellerWorkflowOrder: (orderId: string) =>
    workflowRequest<SellerOrderDetailResponse>(`/seller/orders/${orderId}`, undefined, { invalidateSessionOnUnauthorized: true }),
  cancelSellerWorkflowOrder: (orderId: string) =>
    workflowRequest<SellerCancelOrderResponse>(`/seller/orders/${orderId}/cancel`, {
      method: "POST",
    }, { invalidateSessionOnUnauthorized: true }),
  reissueSellerBuyerInvite: (orderId: string) =>
    workflowRequest<SellerReissueBuyerInviteResponse>(`/seller/orders/${orderId}/buyer-invite/reissue`, {
      method: "POST",
    }, { invalidateSessionOnUnauthorized: true }),
  listBuyerWorkflowOrders: () => workflowRequest<BuyerListOrdersResponse>("/buyer/orders", undefined, { invalidateSessionOnUnauthorized: true }),
  getBuyerWorkflowOrder: (orderId: string) =>
    workflowRequest<BuyerOrderDetailResponse>(`/buyer/orders/${orderId}`, undefined, { invalidateSessionOnUnauthorized: true }),
  createBuyerFundingIntent: (orderId: string) =>
    workflowRequest<BuyerCreateFundingIntentResponse>(`/buyer/orders/${orderId}/fund/intent`, {
      method: "POST",
    }, { invalidateSessionOnUnauthorized: true }),
  confirmBuyerFunding: (orderId: string, payload: BuyerConfirmFundingRequest) =>
    workflowRequest<BuyerConfirmFundingResponse>(`/buyer/orders/${orderId}/fund/confirm`, {
      method: "POST",
      headers: createIdempotencyHeaders("workflow-fund-confirm", orderId, payload.txHash),
      body: JSON.stringify(payload),
    }, { invalidateSessionOnUnauthorized: true }),
  requestBuyerFundingTopUp: (orderId: string) =>
    workflowRequest<BuyerFundingTopUpResponse>(`/buyer/orders/${orderId}/fund/top-up`, {
      method: "POST",
      headers: createIdempotencyHeaders("workflow-fund-top-up", orderId),
    }, { invalidateSessionOnUnauthorized: true }),
  reissueBuyerConfirmation: (orderId: string) =>
    workflowRequest<BuyerReissueConfirmationResponse>(`/buyer/orders/${orderId}/confirmation/reissue`, {
      method: "POST",
    }, { invalidateSessionOnUnauthorized: true }),
  listRiderAvailableJobs: () =>
    workflowRequest<RiderListAvailableJobsResponse>("/rider/jobs/available", undefined, { invalidateSessionOnUnauthorized: true }),
  listRiderJobs: () => workflowRequest<RiderListMyJobsResponse>("/rider/jobs/mine", undefined, { invalidateSessionOnUnauthorized: true }),
  getRiderJob: (orderId: string) =>
    workflowRequest<RiderJobDetailResponse>(`/rider/jobs/${orderId}`, undefined, { invalidateSessionOnUnauthorized: true }),
  acceptRiderJob: (orderId: string) =>
    workflowRequest<RiderAcceptJobResponse>(`/rider/jobs/${orderId}/accept`, {
      method: "POST",
    }, { invalidateSessionOnUnauthorized: true }),
  pickupRiderJob: (orderId: string, payload: RiderPickupJobRequest) =>
    workflowRequest<RiderPickupJobResponse>(`/rider/jobs/${orderId}/pickup`, {
      method: "POST",
      body: JSON.stringify(payload),
    }, { invalidateSessionOnUnauthorized: true }),
  uploadRiderProofFile: async (orderId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    return workflowRequest<RiderCreateProofUploadResponse>(`/rider/jobs/${orderId}/proof/upload`, {
      method: "POST",
      body: formData,
    }, { invalidateSessionOnUnauthorized: true });
  },
  submitRiderProof: (orderId: string, payload: RiderSubmitProofRequest) =>
    workflowRequest<RiderSubmitProofResponse>(`/rider/jobs/${orderId}/proof/submit`, {
      method: "POST",
      body: JSON.stringify(payload),
    }, { invalidateSessionOnUnauthorized: true }),
  viewDeliveryConfirmation: (token: string) =>
    workflowRequest<DeliveryConfirmationViewResponse>(`/confirmations/${token}/view`, {
      method: "POST",
    }),
  approveDeliveryConfirmation: (token: string, payload: ApproveDeliveryConfirmationRequest) =>
    workflowRequest<ApproveDeliveryConfirmationResponse>(`/confirmations/${token}/approve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  rejectDeliveryConfirmation: (token: string, payload: RejectDeliveryConfirmationRequest) =>
    workflowRequest<RejectDeliveryConfirmationResponse>(`/confirmations/${token}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listOperatorReviews: () =>
    workflowRequest<OperatorListReviewsResponse>("/operator/reviews", undefined, { invalidateSessionOnUnauthorized: true }),
  getOperatorReview: (orderId: string) =>
    workflowRequest<OperatorReviewDetailResponse>(`/operator/reviews/${orderId}`, undefined, { invalidateSessionOnUnauthorized: true }),
  listOperatorDisputes: () =>
    workflowRequest<OperatorListDisputesResponse>("/operator/disputes", undefined, { invalidateSessionOnUnauthorized: true }),
  getOperatorDispute: (disputeId: string) =>
    workflowRequest<OperatorDisputeDetailResponse>(`/operator/disputes/${disputeId}`, undefined, { invalidateSessionOnUnauthorized: true }),
  resolveOperatorDispute: (disputeId: string, payload: OperatorResolveDisputeRequest) =>
    workflowRequest<OperatorResolveDisputeResponse>(`/operator/disputes/${disputeId}/resolve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }, { invalidateSessionOnUnauthorized: true }),
  operatorReissueConfirmation: (orderId: string) =>
    workflowRequest<OperatorReissueConfirmationResponse>(`/operator/orders/${orderId}/confirmation/reissue`, {
      method: "POST",
    }, { invalidateSessionOnUnauthorized: true }),
  getSharedWorkflowOrder: (orderId: string) =>
    workflowRequest<SharedOrderDetailResponse>(`/orders/${orderId}`, undefined, { invalidateSessionOnUnauthorized: true }),
};

export const legacyApi = {
  createWalletChallenge: (walletAddress: string) =>
    legacyRequest<{
      challenge_id: string;
      message: string;
      nonce: string;
      issued_at: string;
      expires_at: string;
    }>("/auth/wallet/challenge", {
      method: "POST",
      body: JSON.stringify({
        wallet_address: walletAddress,
        wallet_provider: "freighter",
      }),
    }),
  verifyWalletChallenge: (payload: {
    challenge_id: string;
    wallet_address: string;
    signature: string;
    signed_message: string;
  }) =>
    legacyRequest<{
      wallet_binding: {
        wallet_address: string;
        wallet_provider: string;
        bound_at: string;
        status: "active" | "revoked";
      };
      session_actor: {
        user_id: string;
        email: string | null;
        phone: string | null;
      };
    }>("/auth/wallet/verify", {
      method: "POST",
      headers: createIdempotencyHeaders(payload.challenge_id),
      body: JSON.stringify(payload),
    }),
};
