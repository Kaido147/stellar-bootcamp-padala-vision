# Padala-Vision v2 Implementation Plan

## Phase 1: Foundation

1. Create monorepo folders and workspace configuration.
2. Define shared status enums, attestation types, API request and response contracts.
3. Add Supabase SQL migration for orders, evidence submissions, oracle decisions, transactions, and status history.
4. Document the Soroban contract interface and attestation payload format.

## Phase 2: Soroban Contract

1. Implement the `Order` model, status enum, and storage layout.
2. Implement `create_order`, `fund_order`, `assign_rider`, `mark_in_transit`, `submit_release`, `dispute_order`, and `refund_order`.
3. Enforce exact state transitions and deterministic payout math.
4. Verify oracle signature and attestation expiry before release.
5. Write Rust unit tests for:
   - happy path release
   - invalid state transitions
   - invalid or expired attestation
   - refund and dispute guards

## Phase 3: Backend with Stub Oracle

1. Build an Express server with typed routes and controllers.
2. Add a `VisionOracleProvider` interface with a stub implementation for local MVP testing.
3. Implement services for orders, evidence, audit logs, transactions, and attestation signing.
4. Save database records and return structured API responses for the full happy path.

## Phase 4: Gemini Integration

1. Add `GeminiVisionProvider` behind the same oracle interface.
2. Force structured JSON output and validate it before business logic uses it.
3. Convert low-confidence or malformed responses into `MANUAL_REVIEW` or hard failure.
4. Sign approval attestations only for `APPROVE`.

## Phase 5: Frontend

1. Scaffold a Vite React TypeScript app with Tailwind.
2. Build seller, buyer, rider, evidence, and shared status screens.
3. Add API client, app state helpers, and Freighter integration points.
4. Display timeline, payout summary, and release transaction metadata.

## Phase 6: Verification and Demo

1. Run TypeScript and Rust tests locally.
2. Document required environment variables for Supabase, Gemini, wallet, and oracle signing keys.
3. Capture a clear demo script using the `15 + 3 = 18` escrow scenario.
