alter table public.disputes
  add column if not exists frozen_from_status text null,
  add column if not exists resolution text null,
  add column if not exists resolution_reason text null,
  add column if not exists resolution_note text null,
  add column if not exists resolved_by_user_id text null,
  add column if not exists resolved_by_wallet text null,
  add column if not exists resolved_by_roles_json jsonb not null default '[]'::jsonb,
  add column if not exists resolved_at timestamptz null;

update public.disputes
set frozen_from_status = 'Approved'
where frozen_from_status is null;

alter table public.disputes
  alter column frozen_from_status set not null;

create table if not exists public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  order_id text not null references public.orders(id) on delete cascade,
  action text not null,
  actor_user_id text not null,
  actor_wallet text null,
  actor_roles_json jsonb not null default '[]'::jsonb,
  reason text not null,
  note text null,
  resolution text null,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dispute_events_dispute_id on public.dispute_events(dispute_id);
