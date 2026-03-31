import { useCallback, useEffect, useState } from "react";
import type { GetOrderResponse, OrderHistoryResponse } from "@padala-vision/shared";
import { api } from "../lib/api";

export function useOrderData(orderId: string | undefined) {
  const [orderResponse, setOrderResponse] = useState<GetOrderResponse | null>(null);
  const [historyResponse, setHistoryResponse] = useState<OrderHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orderId) {
      setLoading(false);
      setError("Order id is missing.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [order, history] = await Promise.all([api.getOrder(orderId), api.getHistory(orderId)]);
      setOrderResponse(order);
      setHistoryResponse(history);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    orderResponse,
    historyResponse,
    loading,
    error,
    refresh,
  };
}
