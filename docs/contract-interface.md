# Soroban Contract Interface

Contract name: `PadalaEscrow`

## Order Model

- `order_id: u64`
- `seller: Address`
- `buyer: Address`
- `rider: Option<Address>`
- `item_amount: i128`
- `delivery_fee: i128`
- `total_amount: i128`
- `status: OrderStatus`
- `oracle_pubkey: BytesN<32>`
- `created_at: u64`
- `funded_at: Option<u64>`
- `assigned_at: Option<u64>`
- `in_transit_at: Option<u64>`
- `disputed_at: Option<u64>`
- `dispute_last_activity_at: Option<u64>`
- `expires_at: u64`

## Status Enum

- `Draft`
- `Funded`
- `RiderAssigned`
- `InTransit`
- `EvidenceSubmitted`
- `Approved`
- `Released`
- `Rejected`
- `Disputed`
- `Refunded`
- `Expired`

The contract will persist the canonical on-chain path plus enough enum coverage to mirror the full MVP lifecycle. `EvidenceSubmitted`, `Approved`, and `Rejected` exist so the contract interface stays aligned with the end-to-end status model even if the first implementation only advances to `Released` when an approval attestation is submitted.

## Methods

### `initialize`

Inputs:

- `token_address: Address`
- `oracle_pubkey: BytesN<32>`
- `environment: String`

Rules:

- runs once
- configures the escrow token and oracle verification key

### `create_order`

Inputs:

- `seller: Address`
- `buyer: Address`
- `item_amount: i128`
- `delivery_fee: i128`
- `expires_at: u64`

Rules:

- creates a `Draft` order
- `total_amount = item_amount + delivery_fee`

### `fund_order`

Inputs:

- `order_id: u64`
- buyer auth

Rules:

- only buyer can fund
- only when status is `Draft`
- transfer `total_amount` into escrow
- move to `Funded`

### `assign_rider`

Inputs:

- `order_id: u64`
- `rider: Address`

Rules:

- only when status is `Funded`
- rider can only be assigned once
- move to `RiderAssigned`

### `mark_in_transit`

Inputs:

- `order_id: u64`

Rules:

- only after rider assignment
- move to `InTransit`

### `submit_release`

Inputs:

- `order_id: u64`
- `decision: Symbol`
- `confidence_bps: u32`
- `issued_at_secs: u64`
- `expires_at_secs: u64`
- `nonce: String`
- `contract_id: String`
- `environment: String`
- `signature: BytesN<64>`

Rules:

- only valid for `APPROVE`
- verifies oracle signature against stored oracle public key
- attestation must not be expired
- attestation uses integer unix seconds, never milliseconds
- attestation nonce must be unused for the order
- `contract_id` must match the live contract address
- `environment` must match the configured deployment environment
- order must be in a releasable state
- transfer `item_amount` to seller
- transfer `delivery_fee` to rider
- move to `Released`

### `dispute_order`

Inputs:

- `order_id: u64`
- `caller: Address`

Rules:

- caller must be buyer, seller, or assigned rider
- dispute opens an immediate on-chain financial freeze
- moves order to `Disputed`

### `refund_order`

Inputs:

- `order_id: u64`

Rules:

- buyer auth required
- only under allowed timeout conditions
- funded but unaccepted: `funded_at + 2 hours`
- assigned but not in transit: `assigned_at + 1 hour`
- in transit too long: `in_transit_at + 8 hours`
- dispute inactivity: `dispute_last_activity_at + 24 hours`
- refund buyer
- move to `Refunded`

## Attestation Message Shape

The signed oracle message is deterministic and binary-encoded:

- UTF-8 prefix: `padala-vision:v2`
- one-byte separator: `0x1f`
- version byte: `0x02`
- `order_id` as 8-byte big-endian
- decision code as 1 byte, where `APPROVE = 1`
- `confidence_bps` as 4-byte big-endian
- `issued_at_secs` as 8-byte big-endian
- `expires_at_secs` as 8-byte big-endian
- `nonce` as 2-byte length-prefixed UTF-8
- `contract_id` as 2-byte length-prefixed UTF-8
- `environment` as 2-byte length-prefixed UTF-8

The backend release-intent flow signs this exact payload and the frontend must submit those exact args on-chain without rebuilding legacy timestamp fields.
