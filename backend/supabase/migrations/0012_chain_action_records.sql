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

create index if not exists idx_chain_action_intents_order_id on public.chain_action_intents(order_id);
create index if not exists idx_chain_action_records_order_id on public.chain_action_records(order_id);
