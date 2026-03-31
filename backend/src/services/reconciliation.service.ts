import { HttpError } from "../lib/errors.js";
import { repository, type ReconciliationEventRecord } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";
import { assertHasOperatorRole, getBoundWalletOrThrow } from "./authorization.service.js";
import { ChainService, type ChainOrderStateSnapshot } from "./chain.service.js";
import { ContractRegistryService } from "./contract-registry.service.js";

export class ReconciliationService {
  constructor(
    private readonly chainService = new ChainService(),
    private readonly contractRegistryService = new ContractRegistryService(),
  ) {}

  async reconcileOrder(input: {
    actor: SessionActor;
    orderId: string;
    forceRefresh?: boolean;
    correlationId: string;
  }) {
    assertHasOperatorRole(
      input.actor,
      "reconcile_forbidden",
      "Only ops_reviewer or ops_admin can reconcile orders",
    );

    const order = await repository.getOrder(input.orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }

    const contractSet = await this.contractRegistryService.resolveActiveContractSet();
    const contractId = order.contractId ?? contractSet.contractId;
    const chainState = await this.chainService.getOrderState({
      orderId: input.orderId,
      contractId,
      forceRefresh: input.forceRefresh ?? false,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
    });

    if (chainState.ambiguous) {
      throw new HttpError(409, "Chain returned an ambiguous order state", "reconcile_chain_ambiguous");
    }
    if (!chainState.proven) {
      throw new HttpError(409, "Chain state is not sufficiently proven for reconciliation", "reconcile_chain_unproven");
    }
    if (chainState.orderId !== input.orderId || chainState.contractId !== contractId) {
      throw new HttpError(422, "Chain order state does not match the requested order", "reconcile_chain_mismatch");
    }

    const backendComparable = mapBackendToChainComparable(order.status);
    const driftDetected = order.status !== chainState.status;
    const actionsTaken: string[] = [];

    if (isConflictingFinalState(order.status, chainState.status)) {
      throw new HttpError(409, "Backend and chain final states conflict", "reconcile_final_state_conflict");
    }

    let finalOrder = order;
    if (shouldAdoptChainState(order.status, chainState)) {
      finalOrder = await applyChainState(order.id, chainState);
      actionsTaken.push(`synced_order_status:${finalOrder.status}`);
    }

    const actorWallet = await getBoundWalletOrThrow(input.actor);

    const event = await repository.createReconciliationEvent({
      orderId: input.orderId,
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      backendStateBefore: order.status,
      chainState: chainState.status,
      backendStateAfter: finalOrder.status,
      driftDetected,
      actionsTaken,
      correlationId: input.correlationId,
      forceRefresh: input.forceRefresh ?? false,
    });

    return {
      order_id: input.orderId,
      backend_state: order.status,
      chain_state: chainState.status,
      drift_detected: driftDetected,
      actions_taken: actionsTaken,
      final_state: finalOrder.status,
      reconciliation_event_id: event.id,
    };
  }
}

async function applyChainState(orderId: string, chainState: ChainOrderStateSnapshot) {
  if (chainState.status === "Released") {
    if (chainState.txHash && !(await repository.getTransactionByHash(chainState.txHash))) {
      await repository.createTransaction({
        orderId,
        txHash: chainState.txHash,
        txType: "release",
        txStatus: "confirmed",
      });
    }

    return repository.updateOrderStatus(orderId, "Released", "Reconciled release from proven chain state", {
      releasedAt: chainState.observedAt ?? new Date().toISOString(),
    });
  }

  if (chainState.status === "Refunded") {
    if (chainState.txHash && !(await repository.getTransactionByHash(chainState.txHash))) {
      await repository.createTransaction({
        orderId,
        txHash: chainState.txHash,
        txType: "refund",
        txStatus: "confirmed",
      });
    }

    return repository.updateOrderStatus(orderId, "Refunded", "Reconciled refund from proven chain state");
  }

  if (chainState.status === "Funded") {
    return repository.updateOrderStatus(orderId, "Funded", "Reconciled funded state from proven chain state", {
      fundedAt: chainState.observedAt ?? new Date().toISOString(),
    });
  }

  if (chainState.status === "RiderAssigned") {
    return repository.updateOrderStatus(orderId, "RiderAssigned", "Reconciled rider assignment from proven chain state");
  }

  if (chainState.status === "InTransit") {
    return repository.updateOrderStatus(orderId, "InTransit", "Reconciled in-transit state from proven chain state");
  }

  if (chainState.status === "Disputed") {
    return repository.updateOrderStatus(orderId, "Disputed", "Reconciled disputed state from proven chain state");
  }

  return repository.getOrder(orderId).then((order) => {
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }
    return order;
  });
}

function shouldAdoptChainState(
  backendStatus: Awaited<ReturnType<typeof repository.getOrder>> extends infer T
    ? T extends { status: infer S }
      ? S
      : never
    : never,
  chainState: ChainOrderStateSnapshot,
) {
  if (!chainState.proven) {
    return false;
  }

  const backendComparable = mapBackendToChainComparable(backendStatus);
  const chainRank = CHAIN_STATUS_RANK[chainState.status];
  const backendRank = CHAIN_STATUS_RANK[backendComparable];

  if (chainState.status === "Released" || chainState.status === "Refunded") {
    return backendStatus !== chainState.status;
  }

  return chainRank > backendRank;
}

function isConflictingFinalState(backendStatus: string, chainStatus: ChainOrderStateSnapshot["status"]) {
  return (
    (backendStatus === "Released" && chainStatus === "Refunded") ||
    (backendStatus === "Refunded" && chainStatus === "Released")
  );
}

function mapBackendToChainComparable(status: string): ChainOrderStateSnapshot["status"] {
  switch (status) {
    case "Draft":
      return "Draft";
    case "Funded":
      return "Funded";
    case "RiderAssigned":
      return "RiderAssigned";
    case "InTransit":
    case "EvidenceSubmitted":
    case "Approved":
    case "Rejected":
      return "InTransit";
    case "Disputed":
      return "Disputed";
    case "Released":
      return "Released";
    case "Refunded":
      return "Refunded";
    case "Expired":
      return "Draft";
    default:
      return "Draft";
  }
}

const CHAIN_STATUS_RANK: Record<ChainOrderStateSnapshot["status"], number> = {
  Draft: 0,
  Funded: 1,
  RiderAssigned: 2,
  InTransit: 3,
  Disputed: 4,
  Released: 5,
  Refunded: 5,
};
