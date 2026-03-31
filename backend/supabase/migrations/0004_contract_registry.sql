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
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_contract_registry_active_environment
  on public.contract_registry(environment)
  where status = 'active';
