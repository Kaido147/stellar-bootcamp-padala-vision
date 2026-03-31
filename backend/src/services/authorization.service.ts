import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";

export async function getBoundWalletOrThrow(actor: SessionActor) {
  const binding = await repository.getActiveWalletBindingByUser(actor.userId);
  if (!binding) {
    throw new HttpError(403, "Active wallet binding is required for this action", "wallet_binding_required");
  }

  return binding.walletAddress;
}

export function assertBoundWalletEquals(boundWallet: string, expectedWallet: string, errorCode: string, message: string) {
  if (boundWallet !== expectedWallet) {
    throw new HttpError(403, message, errorCode);
  }
}

export function assertHasOperatorRole(
  actor: SessionActor,
  errorCode = "role_required",
  message = "Operator role is required for this action",
) {
  if (!actor.roles.includes("ops_reviewer") && !actor.roles.includes("ops_admin")) {
    throw new HttpError(403, message, errorCode);
  }
}

export function isOperator(actor: SessionActor) {
  return actor.roles.includes("ops_reviewer") || actor.roles.includes("ops_admin");
}
