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
