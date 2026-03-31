create table if not exists public.orders (
  id text primary key,
  contract_id text null,
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
  expires_at timestamptz not null
);

create table if not exists public.evidence_submissions (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  image_url text not null,
  gps_lat numeric(10, 7) not null,
  gps_lng numeric(10, 7) not null,
  submitted_at timestamptz not null default now(),
  file_hash text null
);

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

create table if not exists public.transactions (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  tx_hash text not null,
  tx_type text not null,
  tx_status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_status_history (
  id uuid primary key,
  order_id text not null references public.orders(id) on delete cascade,
  old_status text null,
  new_status text not null,
  changed_at timestamptz not null default now(),
  note text null
);

create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_buyer_wallet on public.orders(buyer_wallet);
create index if not exists idx_orders_rider_wallet on public.orders(rider_wallet);
create index if not exists idx_evidence_order_id on public.evidence_submissions(order_id);
create index if not exists idx_oracle_decisions_order_id on public.oracle_decisions(order_id);
create index if not exists idx_transactions_order_id on public.transactions(order_id);
create index if not exists idx_order_status_history_order_id on public.order_status_history(order_id);
