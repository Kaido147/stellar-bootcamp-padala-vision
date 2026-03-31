create table if not exists public.wallet_challenges (
  id uuid primary key,
  user_id text not null,
  wallet_address text not null,
  wallet_provider text not null,
  nonce_hash text not null,
  message text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_bindings (
  id uuid primary key,
  user_id text not null,
  wallet_address text not null,
  wallet_provider text not null,
  challenge_id uuid not null references public.wallet_challenges(id),
  verified_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_wallet_bindings_active_wallet
  on public.wallet_bindings(wallet_address)
  where revoked_at is null;

create index if not exists idx_wallet_challenges_user_id on public.wallet_challenges(user_id);
create index if not exists idx_wallet_bindings_user_id on public.wallet_bindings(user_id);
