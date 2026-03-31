# Backend API Contracts

Base path: `/api`

## `POST /api/orders`

Creates a backend order record after the seller initializes a flow.

Request body:

- `seller_wallet`
- `buyer_wallet`
- `item_amount`
- `delivery_fee`
- `expires_at`

Response:

- `order_id`
- `order`
- `expected_total_amount`

## `GET /api/orders/:id`

Returns current order details, latest oracle decision, and latest transaction.

## `GET /api/jobs/funded`

Returns funded jobs available for riders.

## `POST /api/orders/:id/accept`

Assigns a rider.

Request body:

- `rider_wallet`

## `POST /api/orders/:id/in-transit`

Marks the order as in transit.

Request body:

- `rider_wallet`

## `POST /api/evidence/submit`

Submits one evidence item for MVP review.

Request body:

- `order_id`
- `rider_wallet`
- `image_url`
- `gps.lat`
- `gps.lng`
- `timestamp`

Response:

- `decision`
- `confidence`
- `fraud_flags`
- `reason`
- `attestation`

## `POST /api/release`

Triggers release submission using a previously signed oracle attestation.

Request body:

- `order_id`
- `attestation`

## `GET /api/orders/:id/history`

Returns the unified status history and transaction log for demo/debugging.
