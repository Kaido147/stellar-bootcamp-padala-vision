import type { DurableOrderStatus } from "@padala-vision/shared";
import { foundationRepository, type FoundationRepository, type WorkflowOrderRecord } from "../lib/foundation-repository.js";

export class WorkspaceQueryService {
  constructor(private readonly repository: FoundationRepository = foundationRepository) {}

  async listSellerWorkspace(actorId: string) {
    const orders = await this.repository.listWorkflowOrdersBySeller(actorId);
    return {
      needsFunding: filterStatuses(orders, ["awaiting_funding"]),
      activeDelivery: filterStatuses(orders, ["funded", "rider_assigned", "in_transit"]),
      awaitingBuyerConfirmation: filterStatuses(orders, ["awaiting_buyer_confirmation"]),
      needsAttention: filterStatuses(orders, ["manual_review", "dispute_open", "release_pending", "refund_pending"]),
      closed: filterStatuses(orders, ["released", "refunded", "cancelled", "expired"]),
    };
  }

  async listBuyerWorkspace(actorId: string) {
    const orders = await this.repository.listWorkflowOrdersByBuyer(actorId);
    return {
      toFund: filterStatuses(orders, ["awaiting_funding"]),
      inProgress: filterStatuses(orders, ["funded", "rider_assigned", "in_transit", "manual_review", "dispute_open", "release_pending", "refund_pending"]),
      needsYourConfirmation: filterStatuses(orders, ["awaiting_buyer_confirmation"]),
      closed: filterStatuses(orders, ["released", "refunded", "cancelled", "expired"]),
    };
  }

  async listRiderAvailableJobs() {
    return this.repository.listAvailableRiderWorkflowOrders();
  }

  async listRiderAssignedJobs(actorId: string) {
    return this.repository.listAssignedRiderWorkflowOrders(actorId);
  }

  async listOperatorQueues() {
    const [manualReviewQueue, disputeQueue, settlementExceptions, overdueBuyerConfirmations] = await Promise.all([
      this.repository.listWorkflowOrdersByStatuses(["manual_review"]),
      this.repository.listWorkflowOrdersByStatuses(["dispute_open"]),
      this.repository.listWorkflowOrdersByStatuses(["release_pending", "refund_pending"]),
      this.repository.listWorkflowOrdersByStatuses(["awaiting_buyer_confirmation"]).then((orders) =>
        orders.filter((order) => Boolean(order.buyerConfirmationDueAt) && Date.parse(order.buyerConfirmationDueAt!) <= Date.now()),
      ),
    ]);

    return {
      manualReviewQueue,
      disputeQueue,
      overdueBuyerConfirmations,
      settlementExceptions,
    };
  }
}

function filterStatuses(orders: WorkflowOrderRecord[], statuses: DurableOrderStatus[]) {
  return orders.filter((order) => statuses.includes(order.workflowStatus));
}
