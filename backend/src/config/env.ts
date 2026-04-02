import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
export const backendEnvPath = resolve(currentDirPath, "../../.env");

config({
  path: backendEnvPath,
  override: false,
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["staging", "pilot"]).default("staging"),
  PORT: z.coerce.number().default(4000),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("delivery-evidence"),
  ORACLE_PROVIDER: z.enum(["auto", "stub", "gemini"]).default("auto"),
  GEMINI_API_KEY: z.string().optional(),
  ORACLE_SECRET_KEY: z.string().optional(),
  ORACLE_PUBLIC_KEY: z.string().optional(),
  STELLAR_RPC_URL: z.string().optional(),
  STELLAR_NETWORK_PASSPHRASE: z.string().optional(),
  USDC_CONTRACT_ID: z.string().optional(),
  PADALA_ESCROW_CONTRACT_ID: z.string().optional(),
  TOKEN_ADMIN_SECRET: z.string().optional(),
  ORACLE_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.8),
  WALLET_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  ATTESTATION_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  ACTOR_SESSION_COOKIE_NAME: z.string().default("padala_actor_session"),
  ACTOR_SESSION_HMAC_SECRET: z.string().default("development-actor-session-secret"),
});

export const env = envSchema.parse(process.env);

export const runtimeCapabilities = {
  geminiProofAnalysisEnabled: Boolean(env.GEMINI_API_KEY),
} as const;
