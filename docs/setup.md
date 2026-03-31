# Padala-Vision v2 Setup Notes

## Required External Services

- Stellar testnet accounts for seller, buyer, rider, and oracle configuration
- Freighter wallet
- Supabase project with Postgres and Storage
- Gemini API key

## Environment Variables

Backend:

- `PORT`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
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
- `VITE_STELLAR_NETWORK_PASSPHRASE`
- `VITE_RPC_URL`
- `VITE_USDC_CONTRACT_ID`
- `VITE_PADALA_ESCROW_CONTRACT_ID`

To enable the real release transaction path:

1. Copy [frontend/.env.example](/home/carl/Documents/stellar-main-project/frontend/.env.example) to `frontend/.env`
2. Set `VITE_PADALA_ESCROW_CONTRACT_ID` to your deployed Soroban contract ID
3. Set `VITE_RPC_URL` and `VITE_STELLAR_NETWORK_PASSPHRASE` to the same network as Freighter
4. Use Freighter on that same network

The frontend will prepare the `submit_release` invocation, ask Freighter to sign it, submit it to Stellar RPC, and then send the real transaction hash back to the backend for audit/history persistence.

## Supabase Wiring

1. Create a Supabase project.
2. Run the SQL in [0001_padala_vision_schema.sql](/home/carl/Documents/stellar-main-project/backend/supabase/migrations/0001_padala_vision_schema.sql).
3. Copy [backend/.env.example](/home/carl/Documents/stellar-main-project/backend/.env.example) to `backend/.env`.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
5. Start the backend and check `GET /health`.

If Supabase is configured, the health response shows `"repository":"supabase"`. If not, it falls back to `"repository":"memory"`.

For the oracle:

- `ORACLE_PROVIDER=auto` uses Gemini when `GEMINI_API_KEY` is present, otherwise stub
- `ORACLE_PROVIDER=gemini` forces live Gemini evaluation
- `ORACLE_PROVIDER=stub` forces the local stub provider

## Local Tooling Note

Rust is available in the workspace, but the `soroban` CLI is not currently installed. The contract will be written and unit-tested in Rust first, and deployment scripts can be added once the Soroban CLI is present.
