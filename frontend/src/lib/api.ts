import type {
  CreateOrderRequest,
  CreateOrderResponse,
  EvidenceSubmitRequest,
  EvidenceSubmitResponse,
  EvidenceUploadResponse,
  FundedJobsResponse,
  GetOrderResponse,
  OrderHistoryResponse,
  ReleaseRequest,
  ReleaseResponse,
} from "@padala-vision/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers =
    init?.body instanceof FormData
      ? init.headers
      : {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with ${response.status}`);
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
  releaseEscrow: (payload: ReleaseRequest) =>
    request<ReleaseResponse>("/release", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
