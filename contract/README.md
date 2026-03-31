# Padala-Vision Soroban Contract

This contract stores escrow order state and performs deterministic payout after a valid signed delivery oracle attestation.

Current implementation notes:

- Uses a configured token contract address for escrowed funds.
- Uses a configured Ed25519 oracle public key for release verification.
- Uses `initialize(token_address, oracle_pubkey, environment)` for deployment setup.
- Verifies the v2 release attestation payload with seconds-based timestamps, nonce replay protection, contract ID binding, and environment binding.
- Supports on-chain dispute freeze and timeout-based refund gating.
- Can be built locally with the `stellar` CLI in this workspace.
