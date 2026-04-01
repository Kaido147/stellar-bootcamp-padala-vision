# Padala-Vision v2 Setup Notes

## Judge Demo Path

The authoritative judge/demo flow is the one documented in [readme.md](/home/carl/Documents/stellar-main-project/readme.md).

For the shared judge setup:

- the hosted Supabase project already contains the demo actors `SELLER01`, `RIDER01`, and `OPERATOR01`
- the active `staging` `contract_registry` row is already seeded
- the contract metadata in that row matches the IDs and network values documented in the README and `.env` files

## Environment Variables

Backend:

- `PORT`
- `APP_ENV`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `ACTOR_SESSION_HMAC_SECRET`
- `ORACLE_PROVIDER`
- `GEMINI_API_KEY`
- `ORACLE_SECRET_KEY`
- `ORACLE_PUBLIC_KEY`
- `STELLAR_RPC_URL`
- `STELLAR_NETWORK_PASSPHRASE`
- `USDC_CONTRACT_ID`
- `PADALA_ESCROW_CONTRACT_ID`

Frontend:

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_DEV_AUTH_EMAIL`
- `VITE_DEV_AUTH_PASSWORD`
- `VITE_STELLAR_NETWORK_PASSPHRASE`
- `VITE_RPC_URL`
- `VITE_USDC_CONTRACT_ID`
- `VITE_PADALA_ESCROW_CONTRACT_ID`

## Contract Source Of Truth

- Current workflow routes read active contract metadata from the backend `contract_registry` table, not from frontend env vars.
- The committed `STELLAR_RPC_URL`, `STELLAR_NETWORK_PASSPHRASE`, `USDC_CONTRACT_ID`, `PADALA_ESCROW_CONTRACT_ID`, `VITE_RPC_URL`, `VITE_USDC_CONTRACT_ID`, and `VITE_PADALA_ESCROW_CONTRACT_ID` values are intentionally kept as demo references and fallbacks.
- Those committed values should stay aligned with the active `contract_registry` row used by the shared judge Supabase project.

## Supabase Wiring For A Fresh Project

1. Create a Supabase project.
2. Run the migrations in [backend/supabase/migrations](/home/carl/Documents/stellar-main-project/backend/supabase/migrations) in order.
3. Copy [backend/.env.example](/home/carl/Documents/stellar-main-project/backend/.env.example) to `backend/.env`.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
5. Seed the demo actors with [backend/supabase/supabase-demo-actors.sql](/home/carl/Documents/stellar-main-project/backend/supabase/supabase-demo-actors.sql) if you want the README workspace codes.
6. Insert one active `contract_registry` row for your target environment that matches your real escrow contract, token contract, oracle public key, RPC URL, and network passphrase.
7. Start the backend and check `GET /health`.

If Supabase is configured, the health response shows `"repository":"supabase"`. If not, it falls back to `"repository":"memory"`.

## Oracle Mode

- `ORACLE_PROVIDER=auto` uses Gemini when `GEMINI_API_KEY` is present, otherwise stub
- `ORACLE_PROVIDER=gemini` forces live Gemini evaluation
- `ORACLE_PROVIDER=stub` forces the local stub provider

## Optional Wallet Binding

- `/bind-wallet` still uses the legacy `/api/auth/wallet/*` backend surface.
- That page is optional for the judged seller -> buyer -> rider -> buyer confirmation demo, but it remains available.

## Local Tooling Note

Rust and the `stellar` CLI are available in the workspace. Contract builds can be run locally with `stellar contract build`.
