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
