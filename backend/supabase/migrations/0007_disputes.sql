create table if not exists public.disputes (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  actor_user_id text not null,
  actor_wallet text null,
  actor_roles_json jsonb not null default '[]'::jsonb,
  reason_code text not null,
  description text not null,
  evidence_refs_json jsonb not null default '[]'::jsonb,
  status text not null,
  correlation_id text not null,
  last_activity_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_disputes_open_order_id
  on public.disputes(order_id)
  where status = 'open';

create index if not exists idx_disputes_order_id on public.disputes(order_id);
