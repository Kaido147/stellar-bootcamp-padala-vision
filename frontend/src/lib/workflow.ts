import type {
  ActorRole,
  DurableOrderStatus,
  OrderEventType,
  WorkflowTransitionAction,
} from "@padala-vision/shared";
import { humanizeKey } from "./format";

export function formatWorkflowStatus(status: DurableOrderStatus) {
  return humanizeKey(status).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatWorkflowEvent(type: OrderEventType) {
  return humanizeKey(type).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatWorkflowAction(action: WorkflowTransitionAction | null) {
  if (!action) {
    return "No immediate action";
  }

  return humanizeKey(action).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatRoleLabel(role: ActorRole | null | undefined) {
  if (!role) {
    return "System";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function describeWorkflowStatus(status: DurableOrderStatus) {
  switch (status) {
    case "awaiting_funding":
      return "Waiting for the buyer to fund escrow before fulfillment can begin.";
    case "funded":
      return "Escrow is funded and ready for rider assignment.";
    case "rider_assigned":
      return "A rider has accepted the job and should pick up the parcel next.";
    case "in_transit":
      return "The rider is carrying the parcel and preparing delivery proof.";
    case "awaiting_buyer_confirmation":
      return "Proof has been submitted and the buyer must explicitly approve or reject delivery.";
    case "manual_review":
      return "The workflow has been paused for operator review before the next decision.";
    case "dispute_open":
      return "A dispute is open and requires operator attention before settlement continues.";
    case "release_pending":
      return "Delivery was approved and settlement is moving toward release confirmation.";
    case "released":
      return "The happy path is complete and the escrow has been released.";
    case "refund_pending":
      return "A refund has been chosen and is waiting for settlement completion.";
    case "refunded":
      return "The order closed through a refund outcome.";
    case "cancelled":
      return "The order was cancelled before completion.";
    case "expired":
      return "The workflow timed out before it could complete normally.";
    default:
      return "The workflow is active.";
  }
}

export function getWorkflowStatusTone(status: DurableOrderStatus) {
  switch (status) {
    case "manual_review":
    case "dispute_open":
    case "refund_pending":
      return "attention";
    case "awaiting_buyer_confirmation":
    case "release_pending":
    case "funded":
    case "rider_assigned":
    case "in_transit":
      return "active";
    case "released":
    case "refunded":
    case "cancelled":
    case "expired":
      return "closed";
    default:
      return "default";
  }
}
