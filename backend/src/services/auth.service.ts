import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";

const STELLAR_SIGNED_MESSAGE_PREFIX = "Stellar Signed Message:\n";
const DEFAULT_WALLET_PROVIDER = "freighter";

export class AuthService {
  async createWalletChallenge(input: {
    userId: string;
    walletAddress: string;
    walletProvider?: string;
  }) {
    const walletAddress = normalizeWalletAddress(input.walletAddress);
    await assertWalletNotBoundToOtherUser(walletAddress, input.userId);

    const challengeId = randomUUID();
    const nonce = randomBytes(32).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + env.WALLET_CHALLENGE_TTL_SECONDS * 1000);
    const message = buildWalletChallengeMessage({
      challengeId,
      userId: input.userId,
      walletAddress,
      nonce,
      issuedAt,
      expiresAt,
      walletProvider: input.walletProvider ?? DEFAULT_WALLET_PROVIDER,
    });

    await repository.createWalletChallenge({
      id: challengeId,
      userId: input.userId,
      walletAddress,
      walletProvider: input.walletProvider ?? DEFAULT_WALLET_PROVIDER,
      nonceHash: sha256(nonce),
      message,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      challenge_id: challengeId,
      message,
      nonce,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    };
  }

  async verifyWalletChallenge(input: {
    userId: string;
    challengeId: string;
    walletAddress: string;
    signature: string;
    signedMessage: string;
  }) {
    const walletAddress = normalizeWalletAddress(input.walletAddress);
    const challenge = await repository.getWalletChallenge(input.challengeId);

    if (!challenge) {
      throw new HttpError(404, "Wallet challenge not found", "wallet_challenge_not_found");
    }
    if (challenge.userId !== input.userId) {
      throw new HttpError(403, "Wallet challenge does not belong to the authenticated user", "wallet_challenge_forbidden");
    }
    if (challenge.walletAddress !== walletAddress) {
      throw new HttpError(409, "Wallet address does not match the challenge", "wallet_challenge_wallet_mismatch");
    }
    if (challenge.consumedAt) {
      throw new HttpError(409, "Wallet challenge has already been used", "wallet_challenge_used");
    }
    if (Date.parse(challenge.expiresAt) <= Date.now()) {
      throw new HttpError(410, "Wallet challenge has expired", "wallet_challenge_expired");
    }
    if (challenge.message !== input.signedMessage) {
      throw new HttpError(400, "Signed message does not match the issued challenge", "wallet_challenge_message_mismatch");
    }

    await assertWalletNotBoundToOtherUser(walletAddress, input.userId);
    verifyFreighterSignature(walletAddress, challenge.message, input.signature);

    const verifiedAt = new Date().toISOString();
    await repository.consumeWalletChallenge(challenge.id, verifiedAt);
    const binding = await repository.upsertWalletBinding({
      userId: input.userId,
      walletAddress,
      walletProvider: challenge.walletProvider,
      challengeId: challenge.id,
      verifiedAt,
    });

    return {
      wallet_binding: {
        wallet_address: binding.walletAddress,
        wallet_provider: binding.walletProvider,
        bound_at: binding.verifiedAt,
        status: binding.revokedAt ? "revoked" : "active",
      },
    };
  }
}

function buildWalletChallengeMessage(input: {
  challengeId: string;
  userId: string;
  walletAddress: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  walletProvider: string;
}) {
  return [
    "Padala Vision Wallet Binding",
    `Challenge ID: ${input.challengeId}`,
    `User ID: ${input.userId}`,
    `Wallet: ${input.walletAddress}`,
    `Provider: ${input.walletProvider}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expires At: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

function verifyFreighterSignature(walletAddress: string, message: string, signature: string) {
  const signatureBytes = Buffer.from(signature, "base64");
  if (signatureBytes.length === 0) {
    throw new HttpError(400, "Wallet signature is not valid base64", "wallet_signature_invalid_encoding");
  }

  const digest = createHash("sha256")
    .update(`${STELLAR_SIGNED_MESSAGE_PREFIX}${message}`, "utf8")
    .digest();

  const verified = Keypair.fromPublicKey(walletAddress).verify(digest, signatureBytes);
  if (!verified) {
    throw new HttpError(403, "Wallet signature verification failed", "wallet_signature_invalid");
  }
}

function normalizeWalletAddress(walletAddress: string) {
  const normalized = walletAddress.trim();
  if (!StrKey.isValidEd25519PublicKey(normalized)) {
    throw new HttpError(422, "Wallet address is not a valid Stellar public key", "wallet_invalid");
  }

  return normalized;
}

async function assertWalletNotBoundToOtherUser(walletAddress: string, userId: string) {
  const existingBinding = await repository.getActiveWalletBindingByWallet(walletAddress);
  if (existingBinding && existingBinding.userId !== userId) {
    throw new HttpError(409, "Wallet is already bound to another user", "wallet_binding_conflict");
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
