import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";

const {
  buildAttestationV2Payload,
  serializeAttestationV2Payload,
  signAttestationV2,
  toUnixSeconds,
} = await import("./attestation.js");

test("attestation v2 payload converts timestamps to integer unix seconds", () => {
  const payload = buildAttestationV2Payload({
    orderId: "123",
    confidence: 0.95,
    issuedAt: "2026-03-31T10:20:30.900Z",
    expiresAt: "2026-03-31T10:35:30.100Z",
    nonce: "a".repeat(64),
    contractId: "escrow-contract",
    environment: "staging",
  });

  assert.equal(payload.issuedAtSecs, 1774952430);
  assert.equal(payload.expiresAtSecs, 1774953330);
  assert.equal(payload.confidenceBps, 9500);
});

test("attestation v2 rejects millisecond-like numeric timestamps", () => {
  assert.throws(
    () =>
      buildAttestationV2Payload({
        orderId: "123",
        confidence: 0.95,
        issuedAt: 1_774_952_430_900,
        expiresAt: 1_774_953_330,
        nonce: "b".repeat(64),
        contractId: "escrow-contract",
        environment: "pilot",
      }),
    /must be expressed in seconds, not milliseconds/,
  );
});

test("attestation v2 serialization is deterministic", () => {
  const payload = buildAttestationV2Payload({
    orderId: "123",
    confidence: 0.95,
    issuedAt: 1_774_952_430,
    expiresAt: 1_774_953_330,
    nonce: "c".repeat(64),
    contractId: "escrow-contract",
    environment: "pilot",
  });

  const first = Buffer.from(serializeAttestationV2Payload(payload)).toString("hex");
  const second = Buffer.from(serializeAttestationV2Payload(payload)).toString("hex");

  assert.equal(first, second);
  assert.match(first, /^706164616c612d766973696f6e3a7632/);
});

test("attestation v2 signature input includes nonce and environment-contract binding", () => {
  const secret = Keypair.random().secret();
  const basePayload = buildAttestationV2Payload({
    orderId: "123",
    confidence: 0.95,
    issuedAt: 1_774_952_430,
    expiresAt: 1_774_953_330,
    nonce: "d".repeat(64),
    contractId: "escrow-contract",
    environment: "staging",
  });

  const changedNonce = {
    ...basePayload,
    nonce: "e".repeat(64),
  };
  const changedEnvironment = {
    ...basePayload,
    environment: "pilot" as const,
  };

  const baseSignature = signAttestationV2(basePayload, secret).signature;
  const nonceSignature = signAttestationV2(changedNonce, secret).signature;
  const environmentSignature = signAttestationV2(changedEnvironment, secret).signature;

  assert.notEqual(baseSignature, nonceSignature);
  assert.notEqual(baseSignature, environmentSignature);
});

test("toUnixSeconds rejects digit strings that look like milliseconds", () => {
  assert.throws(() => toUnixSeconds("1774952430900", "issuedAt"), /seconds, not milliseconds/);
});
