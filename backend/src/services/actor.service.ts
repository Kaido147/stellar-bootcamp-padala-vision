import { BUYER_CONFIRMATION_FAILED_ATTEMPT_LIMIT, BUYER_CONFIRMATION_LOCKOUT_DURATION_MS, BUYER_CONFIRMATION_REPEATED_LOCKOUT_THRESHOLD, type ActorRecord, type ActorRole, type ActorStatus } from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";
import { foundationRepository, type FoundationRepository, type StoredActorRecord } from "../lib/foundation-repository.js";
import { generateWorkspaceCode, hashPin, verifyPin } from "../lib/foundation-security.js";

export class ActorService {
  constructor(private readonly repository: FoundationRepository = foundationRepository) {}

  async createDemoActor(input: {
    role: Exclude<ActorRole, "buyer">;
    displayName: string;
    pin: string;
    contactLabel?: string | null;
    createdByActorId?: string | null;
  }) {
    const actor = await this.repository.createActor({
      role: input.role,
      status: "active",
      displayName: input.displayName,
      workspaceCode: generateWorkspaceCode(input.role),
      contactLabel: input.contactLabel ?? null,
      pinHash: hashPin(input.pin),
      createdByActorId: input.createdByActorId ?? null,
    });

    return {
      actor: toPublicActor(actor),
      workspaceCode: actor.workspaceCode!,
    };
  }

  async createPendingBuyerActor(input: {
    displayName: string;
    contactLabel?: string | null;
    createdByActorId?: string | null;
  }) {
    const actor = await this.repository.createActor({
      role: "buyer",
      status: "pending_claim",
      displayName: input.displayName,
      workspaceCode: null,
      contactLabel: input.contactLabel ?? null,
      pinHash: null,
      createdByActorId: input.createdByActorId ?? null,
    });

    return toPublicActor(actor);
  }

  async activatePendingBuyerActor(input: {
    actorId: string;
    pin: string;
    displayName?: string | null;
    contactLabel?: string | null;
  }) {
    const actor = await this.repository.getActorById(input.actorId);
    if (!actor) {
      throw new HttpError(404, "Actor not found", "actor_not_found");
    }
    if (actor.role !== "buyer") {
      throw new HttpError(409, "Only buyer actors can be activated from invite claim", "actor_role_invalid");
    }
    if (actor.status !== "pending_claim") {
      throw new HttpError(409, "Buyer actor is already active or disabled", "actor_status_invalid");
    }

    const claimedAt = new Date().toISOString();
    const updated = await this.repository.updateActor(actor.id, {
      status: "active",
      workspaceCode: generateWorkspaceCode(actor.role),
      pinHash: hashPin(input.pin),
      claimedAt,
      displayName: input.displayName ?? actor.displayName,
      contactLabel: input.contactLabel ?? actor.contactLabel,
      failedPinAttempts: 0,
      pinLockedUntil: null,
      repeatedLockoutCount: 0,
    });

    return {
      actor: toPublicActor(updated),
      workspaceCode: updated.workspaceCode!,
    };
  }

  async getActorById(actorId: string) {
    const actor = await this.repository.getActorById(actorId);
    return actor ? toPublicActor(actor) : null;
  }

  async verifyWorkspaceCredentials(input: {
    role: Exclude<ActorRole, "buyer"> | "buyer";
    workspaceCode: string;
    pin: string;
  }) {
    const actor = await this.repository.getActorByWorkspaceCode(input.workspaceCode.trim());
    if (!actor || actor.role !== input.role) {
      throw new HttpError(401, "Invalid workspace code or PIN", "actor_invalid_credentials");
    }
    if (actor.status !== "active") {
      throw new HttpError(403, "Actor is not active", "actor_inactive");
    }

    return this.verifyActorPin(actor, input.pin);
  }

  async verifyActorPinById(actorId: string, pin: string) {
    const actor = await this.repository.getActorById(actorId);
    if (!actor) {
      throw new HttpError(404, "Actor not found", "actor_not_found");
    }

    return this.verifyActorPin(actor, pin);
  }

  private async verifyActorPin(actor: StoredActorRecord, pin: string) {
    const now = Date.now();
    if (actor.pinLockedUntil && Date.parse(actor.pinLockedUntil) > now) {
      return {
        ok: false as const,
        actor: toPublicActor(actor),
        lockedUntil: actor.pinLockedUntil,
        failedAttempts: actor.failedPinAttempts,
        repeatedLockoutCount: actor.repeatedLockoutCount,
        escalatedToManualReviewReady: actor.repeatedLockoutCount >= BUYER_CONFIRMATION_REPEATED_LOCKOUT_THRESHOLD,
      };
    }

    if (!verifyPin(pin, actor.pinHash)) {
      const nextFailedAttempts = actor.failedPinAttempts + 1;
      if (nextFailedAttempts >= BUYER_CONFIRMATION_FAILED_ATTEMPT_LIMIT) {
        const lockedUntil = new Date(now + BUYER_CONFIRMATION_LOCKOUT_DURATION_MS).toISOString();
        const repeatedLockoutCount = actor.repeatedLockoutCount + 1;
        const updated = await this.repository.updateActor(actor.id, {
          failedPinAttempts: 0,
          pinLockedUntil: lockedUntil,
          repeatedLockoutCount,
        });

        return {
          ok: false as const,
          actor: toPublicActor(updated),
          lockedUntil,
          failedAttempts: 0,
          repeatedLockoutCount,
          escalatedToManualReviewReady: repeatedLockoutCount >= BUYER_CONFIRMATION_REPEATED_LOCKOUT_THRESHOLD,
        };
      }

      const updated = await this.repository.updateActor(actor.id, {
        failedPinAttempts: nextFailedAttempts,
        pinLockedUntil: null,
      });

      return {
        ok: false as const,
        actor: toPublicActor(updated),
        lockedUntil: null,
        failedAttempts: nextFailedAttempts,
        repeatedLockoutCount: updated.repeatedLockoutCount,
        escalatedToManualReviewReady: updated.repeatedLockoutCount >= BUYER_CONFIRMATION_REPEATED_LOCKOUT_THRESHOLD,
      };
    }

    const updated = await this.repository.updateActor(actor.id, {
      failedPinAttempts: 0,
      pinLockedUntil: null,
    });

    return {
      ok: true as const,
      actor: toPublicActor(updated),
      lockedUntil: null,
      failedAttempts: 0,
      repeatedLockoutCount: updated.repeatedLockoutCount,
      escalatedToManualReviewReady: updated.repeatedLockoutCount >= BUYER_CONFIRMATION_REPEATED_LOCKOUT_THRESHOLD,
    };
  }
}

function toPublicActor(actor: StoredActorRecord): ActorRecord {
  return {
    id: actor.id,
    role: actor.role,
    status: actor.status as ActorStatus,
    displayName: actor.displayName,
    workspaceCode: actor.workspaceCode,
    contactLabel: actor.contactLabel,
    createdByActorId: actor.createdByActorId,
    claimedAt: actor.claimedAt,
    createdAt: actor.createdAt,
    updatedAt: actor.updatedAt,
    lastLoginAt: actor.lastLoginAt,
  };
}
