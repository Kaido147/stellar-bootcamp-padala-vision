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
