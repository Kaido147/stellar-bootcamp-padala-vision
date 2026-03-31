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
2. Set `VITE_RPC_URL` and `VITE_STELLAR_NETWORK_PASSPHRASE` to the same network as Freighter
3. Keep `VITE_PADALA_ESCROW_CONTRACT_ID` only as a fallback; the frontend should prefer backend `/api/release/intent` metadata for `contract_id`, `rpc_url`, and `network_passphrase`
4. Use Freighter on that same network

The frontend should call backend `POST /api/release/intent`, receive the finalized v2 release args, submit `submit_release` with Freighter, and then send `tx_hash`, `attestation_nonce`, and `submitted_wallet` back to backend `POST /api/release`.

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

Rust and the `stellar` CLI are available in the workspace. Contract builds can be run locally with `stellar contract build`.
