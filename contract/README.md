# Padala-Vision Soroban Contract

This contract stores escrow order state and performs deterministic payout after a valid signed delivery oracle attestation.

Current implementation notes:

- Uses a configured token contract address for escrowed funds.
- Uses a configured Ed25519 oracle public key for release verification.
- Supports the MVP methods plus an `initialize` method for setup.
- Is designed for Rust unit testing first in this repo because the Soroban CLI is not installed yet.
