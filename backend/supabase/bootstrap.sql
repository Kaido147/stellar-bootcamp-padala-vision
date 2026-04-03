begin;

create extension if not exists pgcrypto;

create table if not exists public.actors (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  status text not null,
  display_name text not null,
  workspace_code text null,
  contact_label text null,
  pin_hash text null,
  failed_pin_attempts integer not null default 0,
  pin_locked_until timestamptz null,
  repeated_lockout_count integer not null default 0,
  created_by_actor_id uuid null references public.actors(id) on delete set null,
  claimed_at timestamptz null,
  last_login_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_actors_workspace_code_active
  on public.actors(workspace_code)
  where workspace_code is not null and status <> 'disabled';

create index if not exists idx_actors_role_status on public.actors(role, status);

create table if not exists public.orders (
  id text primary key,
  contract_id text null,
  on_chain_order_id text null,
  seller_wallet text not null,
  buyer_wallet text not null,
  rider_wallet text null,
  item_amount numeric(20, 7) not null,
  delivery_fee numeric(20, 7) not null,
  total_amount numeric(20, 7) not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  funded_at timestamptz null,
  released_at timestamptz null,
  expires_at timestamptz not null,
  order_created_tx_hash text null,
  funding_tx_hash text null,
  funding_status text not null default 'not_started',
  last_chain_reconciliation_status text null,
  last_chain_reconciled_at timestamptz null,
  last_chain_error text null,
  workflow_status text null,
  seller_actor_id uuid null references public.actors(id) on delete set null,
  buyer_actor_id uuid null references public.actors(id) on delete set null,
  rider_actor_id uuid null references public.actors(id) on delete set null,
  public_order_code text null,
  item_description text null,
  pickup_label text null,
  dropoff_label text null,
  funding_deadline_at timestamptz null,
  buyer_confirmation_due_at timestamptz null,
  rider_accept_due_at timestamptz null,
  delivery_due_at timestamptz null,
  manual_review_reason text null,
  last_event_type text null,
  last_event_at timestamptz null,
  delivered_at timestamptz null,
  buyer_confirmed_at timestamptz null
);

create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_buyer_wallet on public.orders(buyer_wallet);
create index if not exists idx_orders_rider_wallet on public.orders(rider_wallet);

create unique index if not exists idx_orders_public_order_code
  on public.orders(public_order_code)
  where public_order_code is not null;

create index if not exists idx_orders_workflow_status
  on public.orders(workflow_status)
  where workflow_status is not null;

create index if not exists idx_orders_seller_actor_workflow
  on public.orders(seller_actor_id, workflow_status, last_event_at desc)
  where seller_actor_id is not null and workflow_status is not null;

create index if not exists idx_orders_buyer_actor_workflow
  on public.orders(buyer_actor_id, workflow_status, last_event_at desc)
  where buyer_actor_id is not null and workflow_status is not null;

create index if not exists idx_orders_rider_actor_workflow
  on public.orders(rider_actor_id, workflow_status, last_event_at desc)
  where rider_actor_id is not null and workflow_status is not null;

create index if not exists idx_orders_available_rider_jobs
  on public.orders(workflow_status, rider_actor_id, funding_deadline_at)
  where workflow_status in ('funded', 'rider_assigned', 'in_transit', 'awaiting_buyer_confirmation', 'manual_review', 'dispute_open');

create unique index if not exists idx_orders_order_created_tx_hash
  on public.orders(order_created_tx_hash)
  where order_created_tx_hash is not null;

create unique index if not exists idx_orders_funding_tx_hash
  on public.orders(funding_tx_hash)
  where funding_tx_hash is not null;

create index if not exists idx_orders_on_chain_order_id
  on public.orders(on_chain_order_id)
  where on_chain_order_id is not null;

create table if not exists public.actor_sessions (
  id uuid primary key,
  actor_id uuid not null references public.actors(id) on delete cascade,
  token_hash text not null unique,
  actor_role text not null,
  status text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_actor_sessions_actor_id_status
  on public.actor_sessions(actor_id, status);

create index if not exists idx_actor_sessions_expires_at
  on public.actor_sessions(expires_at);

create table if not exists public.order_access_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  actor_id uuid not null references public.actors(id) on delete cascade,
  type text not null,
  purpose text not null,
  token_hash text not null unique,
  short_code_hash text null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  invalidated_at timestamptz null,
  invalidated_reason text null,
  created_by_actor_id uuid null references public.actors(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_access_tokens_lookup
  on public.order_access_tokens(order_id, type, actor_id);

create index if not exists idx_order_access_tokens_expires_at
  on public.order_access_tokens(expires_at);

create table if not exists public.order_timeline_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  type text not null,
  actor_id uuid null references public.actors(id) on delete set null,
  actor_role text null,
  note text null,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_timeline_events_order_id
  on public.order_timeline_events(order_id, occurred_at);

create table if not exists public.evidence_submissions (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  image_url text not null,
  gps_lat numeric(10, 7) not null,
  gps_lng numeric(10, 7) not null,
  submitted_at timestamptz not null default now(),
  file_hash text null
);

create index if not exists idx_evidence_order_id on public.evidence_submissions(order_id);

create table if not exists public.oracle_decisions (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  decision text not null,
  confidence numeric(5, 2) not null,
  reason text not null,
  fraud_flags_json jsonb not null default '[]'::jsonb,
  signature text null,
  issued_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_oracle_decisions_order_id on public.oracle_decisions(order_id);

create table if not exists public.transactions (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  tx_hash text not null,
  tx_type text not null,
  tx_status text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_order_id on public.transactions(order_id);
create unique index if not exists idx_transactions_tx_hash on public.transactions(tx_hash);

create table if not exists public.order_status_history (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  old_status text null,
  new_status text not null,
  changed_at timestamptz not null default now(),
  note text null
);

create index if not exists idx_order_status_history_order_id on public.order_status_history(order_id);

create table if not exists public.idempotency_keys (
  scope_key text primary key,
  method text not null,
  path text not null,
  idempotency_key text not null,
  request_hash text not null,
  correlation_id text not null,
  state text not null,
  response_status integer null,
  response_body jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_idempotency_keys_method_path on public.idempotency_keys(method, path);

create table if not exists public.wallet_challenges (
  id uuid primary key,
  user_id text not null,
  wallet_address text not null,
  wallet_provider text not null,
  nonce_hash text not null,
  message text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_challenges_user_id on public.wallet_challenges(user_id);

create table if not exists public.wallet_bindings (
  id uuid primary key,
  user_id text not null,
  wallet_address text not null,
  wallet_provider text not null,
  challenge_id uuid not null references public.wallet_challenges(id),
  verified_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_wallet_bindings_active_wallet
  on public.wallet_bindings(wallet_address)
  where revoked_at is null;

create index if not exists idx_wallet_bindings_user_id on public.wallet_bindings(user_id);

create table if not exists public.contract_registry (
  id uuid primary key,
  environment text not null,
  escrow_contract_id text not null,
  token_contract_id text not null,
  oracle_public_key text not null,
  rpc_url text not null,
  network_passphrase text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contract_version text not null default 'v2',
  interface_version text not null default 'soroban-v2',
  wasm_hash text null,
  deployment_label text null,
  deployed_at timestamptz null,
  activated_at timestamptz null
);

create unique index if not exists idx_contract_registry_active_environment
  on public.contract_registry(environment)
  where status = 'active';

create table if not exists public.release_intents (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  actor_user_id text not null,
  actor_wallet text null,
  actor_roles_json jsonb not null default '[]'::jsonb,
  contract_id text not null,
  environment text not null,
  attestation_nonce text not null unique,
  attestation_payload jsonb not null,
  attestation_signature text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_release_intents_order_id on public.release_intents(order_id);

create table if not exists public.release_records (
  id uuid primary key default gen_random_uuid(),
  release_intent_id uuid not null references public.release_intents(id) on delete cascade,
  order_id text not null references public.orders(id) on delete cascade,
  tx_hash text not null unique,
  attestation_nonce text not null,
  submitted_wallet text not null,
  contract_id text not null,
  status text not null,
  correlation_id text not null,
  confirmed_at timestamptz null,
  chain_ledger bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(release_intent_id)
);

create index if not exists idx_release_records_order_id on public.release_records(order_id);

create table if not exists public.disputes (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  actor_user_id text not null,
  actor_wallet text null,
  actor_roles_json jsonb not null default '[]'::jsonb,
  frozen_from_status text not null,
  reason_code text not null,
  description text not null,
  evidence_refs_json jsonb not null default '[]'::jsonb,
  status text not null,
  correlation_id text not null,
  last_activity_at timestamptz not null,
  resolution text null,
  resolution_reason text null,
  resolution_note text null,
  resolved_by_user_id text null,
  resolved_by_wallet text null,
  resolved_by_roles_json jsonb not null default '[]'::jsonb,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_disputes_open_order_id
  on public.disputes(order_id)
  where status = 'open';

create index if not exists idx_disputes_order_id on public.disputes(order_id);

create table if not exists public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  order_id text not null references public.orders(id) on delete cascade,
  action text not null,
  actor_user_id text not null,
  actor_wallet text null,
  actor_roles_json jsonb not null default '[]'::jsonb,
  reason text not null,
  note text null,
  resolution text null,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dispute_events_dispute_id on public.dispute_events(dispute_id);

create table if not exists public.refund_intents (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  actor_user_id text not null,
  actor_wallet text null,
  actor_roles_json jsonb not null default '[]'::jsonb,
  contract_id text not null,
  environment text not null,
  eligibility_basis text not null,
  eligible_at timestamptz not null,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_refund_intents_order_id on public.refund_intents(order_id);

create table if not exists public.reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  actor_user_id text not null,
  actor_wallet text null,
  actor_roles_json jsonb not null default '[]'::jsonb,
  backend_state_before text not null,
  chain_state text not null,
  backend_state_after text not null,
  drift_detected boolean not null default false,
  actions_taken_json jsonb not null default '[]'::jsonb,
  correlation_id text not null,
  force_refresh boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_reconciliation_events_order_id on public.reconciliation_events(order_id);

create table if not exists public.chain_action_intents (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  action_type text not null,
  actor_user_id text not null,
  actor_wallet text null,
  actor_roles_json jsonb not null default '[]'::jsonb,
  contract_id text not null,
  environment text not null,
  method text not null,
  args_json jsonb not null default '{}'::jsonb,
  replay_key text not null,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chain_action_intents_order_id on public.chain_action_intents(order_id);

create table if not exists public.chain_action_records (
  id uuid primary key default gen_random_uuid(),
  chain_action_intent_id uuid not null references public.chain_action_intents(id) on delete cascade,
  order_id text not null references public.orders(id) on delete cascade,
  action_type text not null,
  tx_hash text not null unique,
  submitted_wallet text not null,
  contract_id text not null,
  status text not null,
  correlation_id text not null,
  confirmed_at timestamptz null,
  chain_ledger bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chain_action_intent_id)
);

create index if not exists idx_chain_action_records_order_id on public.chain_action_records(order_id);

commit;
