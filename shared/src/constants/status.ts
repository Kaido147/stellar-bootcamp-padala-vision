export const ORDER_STATUSES = [
  "Draft",
  "Funded",
  "RiderAssigned",
  "InTransit",
  "EvidenceSubmitted",
  "Approved",
  "Released",
  "Rejected",
  "Disputed",
  "Refunded",
  "Expired",
] as const;

export const ORACLE_DECISIONS = ["APPROVE", "REJECT", "MANUAL_REVIEW"] as const;
