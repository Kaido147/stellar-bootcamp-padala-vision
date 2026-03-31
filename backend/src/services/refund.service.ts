import { randomUUID } from "node:crypto";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";
import { ContractRegistryService } from "./contract-registry.service.js";

const FUNDED_UNACCEPTED_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const ASSIGNED_NOT_IN_TRANSIT_TIMEOUT_MS = 60 * 60 * 1000;
const IN_TRANSIT_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const DISPUTE_INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export class RefundService {
  constructor(private readonly contractRegistryService = new ContractRegistryService()) {}

  async createRefundIntent(input: {
    actor: SessionActor;
    orderId: string;
    correlationId: string;
  }) {
    const order = await repository.getOrder(input.orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }
    if (order.status === "Released" || order.status === "Refunded") {
      throw new HttpError(409, "Order is not eligible for refund", "refund_not_eligible");
    }

    const actorWalletBinding = await repository.getActiveWalletBindingByUser(input.actor.userId);
    const actorWallet = actorWalletBinding?.walletAddress ?? null;
    const isOperator = input.actor.roles.includes("ops_reviewer") || input.actor.roles.includes("ops_admin");

    if (!isOperator) {
      if (!actorWallet || actorWallet !== order.buyerWallet) {
        throw new HttpError(403, "Refund intent requires the buyer or an authorized operator", "refund_forbidden");
      }
    }

    const history = await repository.getHistory(input.orderId);
    const openDispute = await repository.getOpenDisputeByOrderId(input.orderId);
    const eligibility = evaluateRefundEligibility({
      order,
      history,
      openDispute,
      now: new Date(),
    });

    if (!eligibility.eligible) {
      throw new HttpError(409, "Order is not eligible for refund", "refund_not_eligible");
    }

    const contractSet = await this.contractRegistryService.resolveActiveContractSet();
    if (order.contractId && order.contractId !== contractSet.contractId) {
      throw new HttpError(409, "Order contract does not match the active contract registry", "refund_contract_mismatch");
    }

    const refundIntent = await repository.createRefundIntent({
      id: randomUUID(),
      orderId: input.orderId,
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
      eligibilityBasis: eligibility.basis,
      eligibleAt: eligibility.eligibleAt.toISOString(),
      correlationId: input.correlationId,
    });

    return {
      refund_intent_id: refundIntent.id,
      order_id: input.orderId,
      contract_id: contractSet.contractId,
      network_passphrase: contractSet.networkPassphrase,
      rpc_url: contractSet.rpcUrl,
      method: "refund_order",
      args: {
        order_id: input.orderId,
      },
      eligibility_basis: eligibility.basis,
      eligible_at: eligibility.eligibleAt.toISOString(),
    };
  }
}

function evaluateRefundEligibility(input: {
  order: Awaited<ReturnType<typeof repository.getOrder>> extends infer T ? NonNullable<T> : never;
  history: Awaited<ReturnType<typeof repository.getHistory>>;
  openDispute: Awaited<ReturnType<typeof repository.getOpenDisputeByOrderId>>;
  now: Date;
}):
  | {
      eligible: true;
      basis: RefundIntentBasis;
      eligibleAt: Date;
    }
  | {
      eligible: false;
    } {
  if (input.openDispute) {
    const lastActivity = new Date(input.openDispute.lastActivityAt);
    const eligibleAt = new Date(lastActivity.getTime() + DISPUTE_INACTIVITY_TIMEOUT_MS);

    if (input.now >= eligibleAt) {
      return {
        eligible: true,
        basis: "dispute_inactive" as const,
        eligibleAt,
      };
    }

      return {
        eligible: false,
      };
  }

  if (input.order.status === "Rejected") {
    return {
      eligible: true,
      basis: "rejected" as const,
      eligibleAt: new Date(input.order.updatedAt),
    };
  }

  if (input.order.status === "Funded") {
    const fundedAt = input.order.fundedAt ? new Date(input.order.fundedAt) : getLatestStatusTime(input.history, "Funded");
    if (!fundedAt) {
      return { eligible: false };
    }

    const eligibleAt = new Date(fundedAt.getTime() + FUNDED_UNACCEPTED_TIMEOUT_MS);
    return {
      eligible: input.now >= eligibleAt,
      basis: "timeout_funded_unaccepted" as const,
      eligibleAt,
    };
  }

  if (input.order.status === "RiderAssigned") {
    const assignedAt = getLatestStatusTime(input.history, "RiderAssigned");
    if (!assignedAt) {
      return { eligible: false };
    }

    const eligibleAt = new Date(assignedAt.getTime() + ASSIGNED_NOT_IN_TRANSIT_TIMEOUT_MS);
    return {
      eligible: input.now >= eligibleAt,
      basis: "timeout_assigned_not_in_transit" as const,
      eligibleAt,
    };
  }

  if (input.order.status === "InTransit") {
    const inTransitAt = getLatestStatusTime(input.history, "InTransit");
    if (!inTransitAt) {
      return { eligible: false };
    }

    const eligibleAt = new Date(inTransitAt.getTime() + IN_TRANSIT_TIMEOUT_MS);
    return {
      eligible: input.now >= eligibleAt,
      basis: "timeout_in_transit" as const,
      eligibleAt,
    };
  }

  return { eligible: false };
}

type RefundIntentBasis =
  | "rejected"
  | "timeout_funded_unaccepted"
  | "timeout_assigned_not_in_transit"
  | "timeout_in_transit"
  | "dispute_inactive";

function getLatestStatusTime(
  history: Awaited<ReturnType<typeof repository.getHistory>>,
  status: "Funded" | "RiderAssigned" | "InTransit",
) {
  const entry = [...history].reverse().find((item) => item.newStatus === status);
  return entry ? new Date(entry.changedAt) : null;
}
