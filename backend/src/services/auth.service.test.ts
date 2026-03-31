import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.WALLET_CHALLENGE_TTL_SECONDS = "300";

const { AuthService } = await import("./auth.service.js");
const { repository } = await import("../lib/repository.js");

const STELLAR_SIGNED_MESSAGE_PREFIX = "Stellar Signed Message:\n";

test("wallet challenge verify binds wallet and consumes challenge", async () => {
  const authService = new AuthService();
  const wallet = Keypair.random();
  const userId = `user-${randomUUID()}`;

  const challenge = await authService.createWalletChallenge({
    userId,
    walletAddress: wallet.publicKey(),
  });

  const signature = signMessage(wallet, challenge.message);
  const result = await authService.verifyWalletChallenge({
    userId,
    challengeId: challenge.challenge_id,
    walletAddress: wallet.publicKey(),
    signature,
    signedMessage: challenge.message,
  });

  assert.equal(result.wallet_binding.wallet_address, wallet.publicKey());

  const storedChallenge = await repository.getWalletChallenge(challenge.challenge_id);
  assert.ok(storedChallenge?.consumedAt);
});

test("wallet challenge cannot be verified twice", async () => {
  const authService = new AuthService();
  const wallet = Keypair.random();
  const userId = `user-${randomUUID()}`;

  const challenge = await authService.createWalletChallenge({
    userId,
    walletAddress: wallet.publicKey(),
  });

  const signature = signMessage(wallet, challenge.message);
  await authService.verifyWalletChallenge({
    userId,
    challengeId: challenge.challenge_id,
    walletAddress: wallet.publicKey(),
    signature,
    signedMessage: challenge.message,
  });

  await assert.rejects(
    authService.verifyWalletChallenge({
      userId,
      challengeId: challenge.challenge_id,
      walletAddress: wallet.publicKey(),
      signature,
      signedMessage: challenge.message,
    }),
    /already been used/,
  );
});

test("expired wallet challenge is rejected", async () => {
  const authService = new AuthService();
  const wallet = Keypair.random();
  const userId = `user-${randomUUID()}`;
  const challengeId = randomUUID();
  const nonce = randomBytes(32).toString("hex");
  const now = new Date();
  const message = [
    "Padala Vision Wallet Binding",
    `Challenge ID: ${challengeId}`,
    `User ID: ${userId}`,
    `Wallet: ${wallet.publicKey()}`,
    "Provider: freighter",
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now.getTime() - 10_000).toISOString()}`,
    `Expires At: ${new Date(now.getTime() - 5_000).toISOString()}`,
  ].join("\n");

  await repository.createWalletChallenge({
    id: challengeId,
    userId,
    walletAddress: wallet.publicKey(),
    walletProvider: "freighter",
    nonceHash: createHash("sha256").update(nonce, "utf8").digest("hex"),
    message,
    issuedAt: new Date(now.getTime() - 10_000).toISOString(),
    expiresAt: new Date(now.getTime() - 5_000).toISOString(),
  });

  await assert.rejects(
    authService.verifyWalletChallenge({
      userId,
      challengeId,
      walletAddress: wallet.publicKey(),
      signature: signMessage(wallet, message),
      signedMessage: message,
    }),
    /expired/,
  );
});

test("wallet binding conflict with another user is rejected", async () => {
  const authService = new AuthService();
  const wallet = Keypair.random();
  const firstUserId = `user-${randomUUID()}`;
  const secondUserId = `user-${randomUUID()}`;

  const firstChallenge = await authService.createWalletChallenge({
    userId: firstUserId,
    walletAddress: wallet.publicKey(),
  });

  await authService.verifyWalletChallenge({
    userId: firstUserId,
    challengeId: firstChallenge.challenge_id,
    walletAddress: wallet.publicKey(),
    signature: signMessage(wallet, firstChallenge.message),
    signedMessage: firstChallenge.message,
  });

  await assert.rejects(
    authService.createWalletChallenge({
      userId: secondUserId,
      walletAddress: wallet.publicKey(),
    }),
    /already bound to another user/,
  );
});

function signMessage(wallet: Keypair, message: string) {
  const digest = createHash("sha256")
    .update(`${STELLAR_SIGNED_MESSAGE_PREFIX}${message}`, "utf8")
    .digest();

  return wallet.sign(digest).toString("base64");
}
