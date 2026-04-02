alter table public.orders
  add column if not exists on_chain_order_id text null,
  add column if not exists order_created_tx_hash text null,
  add column if not exists funding_tx_hash text null,
  add column if not exists funding_status text not null default 'not_started',
  add column if not exists last_chain_reconciliation_status text null,
  add column if not exists last_chain_reconciled_at timestamptz null,
  add column if not exists last_chain_error text null;

create unique index if not exists idx_orders_order_created_tx_hash
  on public.orders(order_created_tx_hash)
  where order_created_tx_hash is not null;

create unique index if not exists idx_orders_funding_tx_hash
  on public.orders(funding_tx_hash)
  where funding_tx_hash is not null;

create index if not exists idx_orders_on_chain_order_id
  on public.orders(on_chain_order_id)
  where on_chain_order_id is not null;
