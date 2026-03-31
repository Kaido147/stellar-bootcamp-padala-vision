import { FOUNDATION_POLICY, type SessionActor } from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";
import { foundationRepository, type FoundationRepository } from "../lib/foundation-repository.js";
import { createSignedActorSessionToken, hashOpaqueToken, verifySignedActorSessionToken } from "../lib/foundation-security.js";

export class SessionService {
  constructor(private readonly repository: FoundationRepository = foundationRepository) {}

  async createSession(actorId: string) {
    const actor = await this.repository.getActorById(actorId);
    if (!actor) {
      throw new HttpError(404, "Actor not found", "actor_not_found");
    }
    if (actor.status !== "active") {
      throw new HttpError(403, "Only active actors can create sessions", "actor_inactive");
    }

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + FOUNDATION_POLICY.sessionTtlMs);
    const { sessionId, token } = createSignedActorSessionToken();
    const session = await this.repository.createActorSession({
      id: sessionId,
      actorId: actor.id,
      actorRole: actor.role,
      tokenHash: hashOpaqueToken(token),
      status: "active",
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastSeenAt: issuedAt.toISOString(),
    });

    await this.repository.updateActor(actor.id, {
      lastLoginAt: issuedAt.toISOString(),
    });

    return {
      token,
      session,
    };
  }

  async resolveSessionActor(token: string): Promise<SessionActor | null> {
    const context = await this.getSessionContext(token);
    return context?.actor ?? null;
  }

  async getSessionContext(token: string) {
    const parsed = verifySignedActorSessionToken(token);
    if (!parsed) {
      return null;
    }

    const session = await this.repository.getActorSessionByTokenHash(hashOpaqueToken(token));
    if (!session || session.id !== parsed.sessionId) {
      return null;
    }
    if (session.status !== "active") {
      return null;
    }
    if (Date.parse(session.expiresAt) <= Date.now()) {
      await this.repository.updateActorSession(session.id, {
        status: "expired",
      });
      return null;
    }

    const actor = await this.repository.getActorById(session.actorId);
    if (!actor || actor.status !== "active") {
      return null;
    }

    await this.repository.updateActorSession(session.id, {
      lastSeenAt: new Date().toISOString(),
    });

    return {
      actor: {
        sessionId: session.id,
        actorId: actor.id,
        role: actor.role,
        status: actor.status,
      } satisfies SessionActor,
      session,
      actorRecord: actor,
    };
  }

  async revokeSession(token: string) {
    const parsed = verifySignedActorSessionToken(token);
    if (!parsed) {
      return false;
    }

    const session = await this.repository.getActorSessionByTokenHash(hashOpaqueToken(token));
    if (!session) {
      return false;
    }

    await this.repository.revokeActorSession(session.id, new Date().toISOString());
    return true;
  }
}
