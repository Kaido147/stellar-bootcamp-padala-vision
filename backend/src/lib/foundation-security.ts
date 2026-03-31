import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { isValidBuyerPin } from "@padala-vision/shared";
import { env } from "../config/env.js";

const PIN_HASH_PREFIX = "scrypt";
const SESSION_TOKEN_VERSION = "v1";

export function generateWorkspaceCode(role: string) {
  const prefix = role.slice(0, 3).toUpperCase();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${suffix}`;
}

export function createOpaqueToken(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSignedActorSessionToken(sessionId = randomUUID()) {
  const secret = createOpaqueToken(24);
  const payload = `${SESSION_TOKEN_VERSION}.${sessionId}.${secret}`;
  const signature = signValue(payload);

  return {
    sessionId,
    token: `${payload}.${signature}`,
  };
}

export function verifySignedActorSessionToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const [version, sessionId, secret, signature] = parts;
  if (version !== SESSION_TOKEN_VERSION || !sessionId || !secret || !signature) {
    return null;
  }

  const payload = `${version}.${sessionId}.${secret}`;
  const expected = signValue(payload);
  if (!safeEqual(signature, expected)) {
    return null;
  }

  return {
    sessionId,
    secret,
  };
}

export function hashPin(pin: string) {
  if (!isValidBuyerPin(pin)) {
    throw new Error("PIN must be a 6-digit numeric value");
  }

  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(pin, salt, 64).toString("hex");
  return `${PIN_HASH_PREFIX}:${salt}:${derived}`;
}

export function verifyPin(pin: string, storedHash: string | null) {
  if (!storedHash) {
    return false;
  }

  const [prefix, salt, expected] = storedHash.split(":");
  if (prefix !== PIN_HASH_PREFIX || !salt || !expected) {
    return false;
  }

  const actual = scryptSync(pin, salt, 64).toString("hex");
  return safeEqual(actual, expected);
}

function signValue(value: string) {
  return createHmac("sha256", env.ACTOR_SESSION_HMAC_SECRET).update(value, "utf8").digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
