alter table public.contract_registry
  add column if not exists contract_version text not null default 'v2',
  add column if not exists interface_version text not null default 'soroban-v2',
  add column if not exists wasm_hash text null,
  add column if not exists deployment_label text null,
  add column if not exists deployed_at timestamptz null,
  add column if not exists activated_at timestamptz null;
