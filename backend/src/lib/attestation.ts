import { randomBytes, sign } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import type { OracleAttestationPayload, SignedOracleAttestation } from "@padala-vision/shared";
import { HttpError } from "./errors.js";

const ATTESTATION_V1_PREFIX = "padala-vision:v1";
const ATTESTATION_V2_PREFIX = "padala-vision:v2";
const FIELD_SEPARATOR = Uint8Array.from([0x1f]);

export interface AttestationV2Payload {
  version: "v2";
  orderId: string;
  decision: "APPROVE";
  confidenceBps: number;
  issuedAtSecs: number;
  expiresAtSecs: number;
  nonce: string;
  contractId: string;
  environment: "staging" | "pilot";
}

export interface SignedAttestationV2 extends AttestationV2Payload {
  signature: string;
}

export function buildAttestationMessageBytes(payload: OracleAttestationPayload): Uint8Array {
  const prefix = Buffer.from(ATTESTATION_V1_PREFIX, "utf8");
  const orderId = bigIntToBytes(BigInt(payload.orderId));
  const decisionCode = Uint8Array.from([1]);
  const confidenceBps = numberToU32Bytes(Math.round(payload.confidence * 10_000));
  const issuedAt = bigIntToBytes(BigInt(new Date(payload.issuedAt).getTime()));
  const expiresAt = bigIntToBytes(BigInt(new Date(payload.expiresAt).getTime()));

  return Buffer.concat([
    prefix,
    Buffer.from(FIELD_SEPARATOR),
    Buffer.from(orderId),
    Buffer.from(decisionCode),
    Buffer.from(confidenceBps),
    Buffer.from(issuedAt),
    Buffer.from(expiresAt),
  ]);
}

export function signAttestation(
  payload: OracleAttestationPayload,
  pkcs8PrivateKeyPem?: string,
): SignedOracleAttestation {
  if (!pkcs8PrivateKeyPem) {
    return {
      ...payload,
      signature: Buffer.from(randomBytes(64)).toString("hex"),
    };
  }

  const message = buildAttestationMessageBytes(payload);
  const signature = sign(null, Buffer.from(message), pkcs8PrivateKeyPem);

  return {
    ...payload,
    signature: signature.toString("hex"),
  };
}

export function buildAttestationV2Payload(input: {
  orderId: string;
  confidence: number;
  issuedAt: string | number | Date;
  expiresAt: string | number | Date;
  nonce?: string;
  contractId: string;
  environment: "staging" | "pilot";
}): AttestationV2Payload {
  const nonce = normalizeNonce(input.nonce ?? randomBytes(32).toString("hex"));
  const issuedAtSecs = toUnixSeconds(input.issuedAt, "issuedAt");
  const expiresAtSecs = toUnixSeconds(input.expiresAt, "expiresAt");

  if (expiresAtSecs <= issuedAtSecs) {
    throw new HttpError(422, "Attestation expiresAt must be later than issuedAt", "attestation_invalid_expiry");
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new HttpError(422, "Attestation confidence must be between 0 and 1", "attestation_invalid_confidence");
  }
  if (!input.contractId.trim()) {
    throw new HttpError(422, "Attestation contractId is required", "attestation_contract_required");
  }

  return {
    version: "v2",
    orderId: normalizeOrderId(input.orderId),
    decision: "APPROVE",
    confidenceBps: Math.round(input.confidence * 10_000),
    issuedAtSecs,
    expiresAtSecs,
    nonce,
    contractId: input.contractId.trim(),
    environment: input.environment,
  };
}

export function serializeAttestationV2Payload(payload: AttestationV2Payload): Uint8Array {
  return Buffer.concat([
    Buffer.from(ATTESTATION_V2_PREFIX, "utf8"),
    Buffer.from(FIELD_SEPARATOR),
    Buffer.from(Uint8Array.of(2)),
    Buffer.from(bigIntToBytes(BigInt(payload.orderId))),
    Buffer.from(Uint8Array.of(1)),
    Buffer.from(numberToU32Bytes(payload.confidenceBps)),
    Buffer.from(bigIntToBytes(BigInt(payload.issuedAtSecs))),
    Buffer.from(bigIntToBytes(BigInt(payload.expiresAtSecs))),
    Buffer.from(lengthPrefixedUtf8(payload.nonce)),
    Buffer.from(lengthPrefixedUtf8(payload.contractId)),
    Buffer.from(lengthPrefixedUtf8(payload.environment)),
  ]);
}

export function signAttestationV2(
  payload: AttestationV2Payload,
  oracleSecretKey: string,
): SignedAttestationV2 {
  if (!oracleSecretKey?.trim()) {
    throw new HttpError(503, "ORACLE_SECRET_KEY is required for attestation v2 signing", "attestation_signing_unavailable");
  }

  const keypair = Keypair.fromSecret(oracleSecretKey.trim());
  const message = serializeAttestationV2Payload(payload);
  const signature = keypair.sign(Buffer.from(message)).toString("hex");

  return {
    ...payload,
    signature,
  };
}

export function toUnixSeconds(value: string | number | Date, fieldName: string): number {
  if (value instanceof Date) {
    return fromEpochMilliseconds(value.getTime(), fieldName);
  }

  if (typeof value === "number") {
    return fromNumericTimestamp(value, fieldName);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(422, `Attestation ${fieldName} is required`, "attestation_timestamp_required");
  }

  if (/^\d+$/.test(trimmed)) {
    return fromNumericTimestamp(Number(trimmed), fieldName);
  }

  const parsedMillis = Date.parse(trimmed);
  if (Number.isNaN(parsedMillis)) {
    throw new HttpError(422, `Attestation ${fieldName} is invalid`, "attestation_timestamp_invalid");
  }

  return fromEpochMilliseconds(parsedMillis, fieldName);
}

function bigIntToBytes(value: bigint): Uint8Array {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value);
  return bytes;
}

function numberToU32Bytes(value: number): Uint8Array {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function lengthPrefixedUtf8(value: string): Uint8Array {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > 0xffff) {
    throw new HttpError(422, "Attestation field exceeds maximum length", "attestation_field_too_large");
  }

  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function normalizeNonce(nonce: string): string {
  const normalized = nonce.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new HttpError(422, "Attestation nonce must be a 32-byte hex string", "attestation_nonce_invalid");
  }

  return normalized;
}

function normalizeOrderId(orderId: string): string {
  const normalized = orderId.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new HttpError(422, "Attestation orderId must be an unsigned integer string", "attestation_order_id_invalid");
  }

  BigInt(normalized);
  return normalized;
}

function fromNumericTimestamp(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError(422, `Attestation ${fieldName} is invalid`, "attestation_timestamp_invalid");
  }
  if (value >= 1e11) {
    throw new HttpError(
      422,
      `Attestation ${fieldName} must be expressed in seconds, not milliseconds`,
      "attestation_timestamp_milliseconds_rejected",
    );
  }
  if (!Number.isInteger(value)) {
    throw new HttpError(422, `Attestation ${fieldName} must be an integer second value`, "attestation_timestamp_invalid");
  }

  return value;
}

function fromEpochMilliseconds(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError(422, `Attestation ${fieldName} is invalid`, "attestation_timestamp_invalid");
  }

  return Math.floor(value / 1000);
}
