import { TOKEN_LIFECYCLE_POLICIES, type TokenType } from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";
import { foundationRepository, type FoundationRepository } from "../lib/foundation-repository.js";
import { createOpaqueToken, hashOpaqueToken } from "../lib/foundation-security.js";

export class TokenService {
  constructor(private readonly repository: FoundationRepository = foundationRepository) {}

  async issueToken(input: {
    orderId: string;
    actorId: string;
    type: TokenType;
    createdByActorId?: string | null;
    shortCode?: string | null;
  }) {
    const policy = TOKEN_LIFECYCLE_POLICIES[input.type];
    const now = new Date();
    const token = createOpaqueToken();
    const expiresAt = new Date(now.getTime() + policy.ttlMs).toISOString();

    await this.repository.invalidateOrderAccessTokens({
      orderId: input.orderId,
      type: input.type,
      actorId: input.actorId,
      invalidatedAt: now.toISOString(),
      reason: "reissued",
    });

    const created = await this.repository.createOrderAccessToken({
      orderId: input.orderId,
      actorId: input.actorId,
      type: input.type,
      purpose: policy.defaultPurpose,
      tokenHash: hashOpaqueToken(token),
      shortCodeHash: input.shortCode ? hashOpaqueToken(input.shortCode) : null,
      expiresAt,
      createdByActorId: input.createdByActorId ?? null,
    });

    return {
      token,
      record: created,
    };
  }

  async validateToken(rawToken: string, expectedType?: TokenType) {
    const token = await this.repository.getOrderAccessTokenByTokenHash(hashOpaqueToken(rawToken));
    if (!token) {
      return null;
    }
    if (expectedType && token.type !== expectedType) {
      return null;
    }
    if (token.invalidatedAt || token.consumedAt) {
      return null;
    }
    if (Date.parse(token.expiresAt) <= Date.now()) {
      return null;
    }

    return token;
  }

  async consumeToken(rawToken: string, expectedType?: TokenType) {
    const token = await this.validateToken(rawToken, expectedType);
    if (!token) {
      throw new HttpError(401, "Token is invalid, expired, or already used", "token_invalid");
    }

    const consumed = await this.repository.consumeOrderAccessToken(token.id, new Date().toISOString());
    if (!consumed || !consumed.consumedAt) {
      throw new HttpError(409, "Token has already been consumed", "token_already_consumed");
    }

    return consumed;
  }
}
