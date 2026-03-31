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

alter table public.orders
  add column if not exists workflow_status text null,
  add column if not exists seller_actor_id uuid null references public.actors(id) on delete set null,
  add column if not exists buyer_actor_id uuid null references public.actors(id) on delete set null,
  add column if not exists rider_actor_id uuid null references public.actors(id) on delete set null,
  add column if not exists public_order_code text null,
  add column if not exists item_description text null,
  add column if not exists pickup_label text null,
  add column if not exists dropoff_label text null,
  add column if not exists funding_deadline_at timestamptz null,
  add column if not exists buyer_confirmation_due_at timestamptz null,
  add column if not exists rider_accept_due_at timestamptz null,
  add column if not exists delivery_due_at timestamptz null,
  add column if not exists manual_review_reason text null,
  add column if not exists last_event_type text null,
  add column if not exists last_event_at timestamptz null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists buyer_confirmed_at timestamptz null;

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
