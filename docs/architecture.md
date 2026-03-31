# Padala-Vision v2 Architecture

Padala-Vision is a mobile-first minimized-trust escrow dApp for informal social commerce in the Philippines. The contract enforces escrow state transitions and deterministic payout rules, while an off-chain backend oracle evaluates delivery evidence and returns a signed delivery oracle attestation.

## Proposed Folder Structure

```text
/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── lib/
│   │   ├── middleware/
│   │   ├── providers/
│   │   │   └── oracle/
│   │   ├── routes/
│   │   ├── services/
│   │   └── validators/
│   ├── supabase/
│   │   └── migrations/
│   └── package.json
├── contract/
│   ├── src/
│   ├── tests/
│   ├── Cargo.toml
│   └── README.md
├── docs/
│   ├── architecture.md
│   ├── implementation-plan.md
│   └── setup.md
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── services/
│   │   └── styles/
│   └── package.json
├── shared/
│   ├── src/
│   │   ├── api/
│   │   ├── constants/
│   │   └── types/
│   └── package.json
├── package.json
└── tsconfig.base.json
```

## Runtime Responsibilities

### Frontend

- Seller creates an order and receives a shareable buyer link.
- Buyer connects Freighter, reviews escrow totals, and funds the order.
- Rider browses funded jobs, accepts one job, marks it in transit, and uploads delivery evidence.
- Shared order timeline shows lifecycle progress, release state, and transaction information.
- Frontend calls backend APIs and submits the release transaction after receiving a valid oracle attestation.

### Backend

- Exposes REST endpoints for orders, jobs, evidence, release, and history.
- Stores order state, audit history, oracle decisions, and transaction records in Supabase Postgres.
- Stores evidence references in Supabase Storage.
- Evaluates evidence through a `VisionOracleProvider` abstraction.
- Applies business rules to parsed model output.
- Signs approval attestations with a server-held oracle key.

For local development without credentials, the backend falls back to an in-memory repository. When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, persistence switches to Supabase automatically.

### Contract

- Stores deterministic order state and payout amounts.
- Verifies a signed delivery oracle attestation.
- Releases the seller item amount and rider delivery fee after valid oracle approval.
- Supports `dispute_order` and `refund_order` fallback paths for the MVP.

## State Machine

Primary path:

`Draft -> Funded -> RiderAssigned -> InTransit -> EvidenceSubmitted -> Approved -> Released`

Alternative states:

`Rejected`, `Disputed`, `Refunded`, `Expired`

### State Ownership

- Contract owns: `Draft`, `Funded`, `RiderAssigned`, `InTransit`, `Released`, `Disputed`, `Refunded`, `Expired`
- Backend mirrors contract state and records off-chain workflow states: `EvidenceSubmitted`, `Approved`, `Rejected`
- Frontend displays a unified timeline composed from backend records plus on-chain release status

This split keeps payout deterministic on-chain while acknowledging that evidence review is an off-chain trusted step.
