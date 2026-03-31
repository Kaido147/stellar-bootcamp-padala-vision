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

create unique index if not exists idx_transactions_tx_hash on public.transactions(tx_hash);
create index if not exists idx_release_records_order_id on public.release_records(order_id);
