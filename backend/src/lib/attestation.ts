import { randomBytes, sign } from "node:crypto";
import type { OracleAttestationPayload, SignedOracleAttestation } from "@padala-vision/shared";

export function buildAttestationMessageBytes(payload: OracleAttestationPayload): Uint8Array {
  const prefix = Buffer.from("padala-vision:v1", "utf8");
  const separator = Uint8Array.from([0x1f]);
  const orderId = bigIntToBytes(BigInt(payload.orderId));
  const decisionCode = Uint8Array.from([1]);
  const confidenceBps = numberToU32Bytes(Math.round(payload.confidence * 10_000));
  const issuedAt = bigIntToBytes(BigInt(new Date(payload.issuedAt).getTime()));
  const expiresAt = bigIntToBytes(BigInt(new Date(payload.expiresAt).getTime()));

  return Buffer.concat([
    prefix,
    Buffer.from(separator),
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
