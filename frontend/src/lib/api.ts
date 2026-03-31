import type {
  CreateOrderRequest,
  CreateOrderResponse,
  EvidenceSubmitRequest,
  EvidenceSubmitResponse,
  EvidenceUploadResponse,
  FundedJobsResponse,
  GetOrderResponse,
  OrderHistoryResponse,
  ReleaseIntentRequest,
  ReleaseIntentResponse,
  ReleaseRecordRequest,
  ReleaseRecordResponse,
} from "@padala-vision/shared";
import { getSupabaseAccessToken } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getSupabaseAccessToken();
  const headers =
    init?.body instanceof FormData
      ? new Headers(init.headers)
      : new Headers({
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        });

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof body.error === "string" ? body.error : `Request failed with ${response.status}`,
      response.status,
      typeof body.code === "string" ? body.code : undefined,
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  createOrder: (payload: CreateOrderRequest) =>
    request<CreateOrderResponse>("/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getOrder: (orderId: string) => request<GetOrderResponse>(`/orders/${orderId}`),
  getHistory: (orderId: string) => request<OrderHistoryResponse>(`/orders/${orderId}/history`),
  listFundedJobs: () => request<FundedJobsResponse>("/jobs/funded"),
  fundOrder: (orderId: string) =>
    request<{ order: GetOrderResponse["order"] }>(`/orders/${orderId}/fund`, {
      method: "POST",
    }),
  acceptJob: (orderId: string, riderWallet: string) =>
    request<{ order: GetOrderResponse["order"] }>(`/orders/${orderId}/accept`, {
      method: "POST",
      body: JSON.stringify({ rider_wallet: riderWallet }),
    }),
  markInTransit: (orderId: string, riderWallet: string) =>
    request<{ order: GetOrderResponse["order"] }>(`/orders/${orderId}/in-transit`, {
      method: "POST",
      body: JSON.stringify({ rider_wallet: riderWallet }),
    }),
  uploadEvidenceFile: async (orderId: string, riderWallet: string, file: File) => {
    const formData = new FormData();
    formData.append("order_id", orderId);
    formData.append("rider_wallet", riderWallet);
    formData.append("file", file);

    return request<EvidenceUploadResponse>("/evidence/upload", {
      method: "POST",
      body: formData,
    });
  },
  submitEvidence: (payload: EvidenceSubmitRequest) =>
    request<EvidenceSubmitResponse>("/evidence/submit", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createReleaseIntent: (payload: ReleaseIntentRequest) =>
    request<ReleaseIntentResponse>("/release/intent", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  recordRelease: (payload: ReleaseRecordRequest) =>
    request<ReleaseRecordResponse>("/release", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createWalletChallenge: (walletAddress: string) =>
    request<{
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
    request<{
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
      body: JSON.stringify(payload),
    }),
  createDispute: (payload: {
    order_id: string;
    reason_code: string;
    description: string;
    evidence_refs?: string[];
  }) =>
    request<{
      dispute_id: string;
      order_id: string;
      dispute_status: string;
      order_status: string;
      dispute: unknown;
    }>("/disputes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  resolveDispute: (
    disputeId: string,
    payload: {
      resolution: "release" | "refund" | "reject_dispute";
      reason: string;
      note: string;
      tx_hash?: string;
      attestation_nonce?: string;
      submitted_wallet?: string;
    },
  ) =>
    request<{
      dispute_id: string;
      resolution: string;
      resolution_status: "pending" | "resolved";
      order_status: string;
      next_action: string | null;
    }>(`/disputes/${disputeId}/resolve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createRefundIntent: (orderId: string) =>
    request<{
      refund_intent_id: string;
      order_id: string;
      contract_id: string;
      network_passphrase: string;
      rpc_url: string;
      method: "refund_order";
      args: {
        order_id: string;
      };
      eligibility_basis: string;
      eligible_at: string;
    }>("/refunds/intent", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId }),
    }),
  reconcileOrder: (orderId: string, forceRefresh = false) =>
    request<{ order_status: string; chain_state: string; actions_taken: string[] }>(
      `/reconcile/orders/${orderId}`,
      {
        method: "POST",
        body: JSON.stringify({ force_refresh: forceRefresh }),
      },
    ),
};
