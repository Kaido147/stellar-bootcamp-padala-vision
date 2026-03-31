begin;

with seed_data as (
  select *
  from (
    values
      (
        '9ac12b5e-fd28-4188-820a-c9090a2b75d1'::uuid,
        'seller'::text,
        'active'::text,
        'Demo Seller'::text,
        'SELLER01'::text,
        null::text,
        'scrypt:2e4878c48f7bdca27770845c6d270994:2b8c9230b143db3eff0722855d710617476c104b17a024df778f4d9967f7614cee2250a19e1d1161d1915f13eb526b870b7c2970d5cdb82a66d236d2852a221f'::text,
        0::integer,
        null::timestamptz,
        0::integer,
        null::uuid,
        null::timestamptz,
        null::timestamptz,
        '2026-03-31T00:00:00Z'::timestamptz,
        '2026-03-31T00:00:00Z'::timestamptz
      ),
      (
        'e388499a-edf7-4fdd-ad5f-02083d9092b9'::uuid,
        'rider'::text,
        'active'::text,
        'Demo Rider'::text,
        'RIDER01'::text,
        null::text,
        'scrypt:0c1b613851b93c6e8cd4c23faa05fe03:b3100b3d78aae3e2e2394c1d282440126891264532a7862ac6717f9f1fc7e2c0c893c895bec446d1b8a4f645debfd6464c9c8cb46b901754a2ea9e30a2660c01'::text,
        0::integer,
        null::timestamptz,
        0::integer,
        null::uuid,
        null::timestamptz,
        null::timestamptz,
        '2026-03-31T00:00:00Z'::timestamptz,
        '2026-03-31T00:00:00Z'::timestamptz
      ),
      (
        'd42dc738-8d5e-4819-a780-884fcc9fce3c'::uuid,
        'operator'::text,
        'active'::text,
        'Demo Operator'::text,
        'OPERATOR01'::text,
        null::text,
        'scrypt:bcc94cd5c503208ea8d0801546aca96b:18f5724f7a06914cb7d37b5248c554546063d82e716799534c85c7aa98432bd5199d8aca75522f9c684599c828572046e50ce8fd06cdc2bcef7f37a32503c281'::text,
        0::integer,
        null::timestamptz,
        0::integer,
        null::uuid,
        null::timestamptz,
        null::timestamptz,
        '2026-03-31T00:00:00Z'::timestamptz,
        '2026-03-31T00:00:00Z'::timestamptz
      )
  ) as rows (
    id,
    role,
    status,
    display_name,
    workspace_code,
    contact_label,
    pin_hash,
    failed_pin_attempts,
    pin_locked_until,
    repeated_lockout_count,
    created_by_actor_id,
    claimed_at,
    last_login_at,
    created_at,
    updated_at
  )
),
updated as (
  update public.actors as actors
  set
    role = seed.role,
    status = seed.status,
    display_name = seed.display_name,
    contact_label = seed.contact_label,
    pin_hash = seed.pin_hash,
    failed_pin_attempts = seed.failed_pin_attempts,
    pin_locked_until = seed.pin_locked_until,
    repeated_lockout_count = seed.repeated_lockout_count,
    created_by_actor_id = seed.created_by_actor_id,
    claimed_at = seed.claimed_at,
    last_login_at = seed.last_login_at,
    updated_at = seed.updated_at
  from seed_data as seed
  where actors.workspace_code = seed.workspace_code
  returning actors.workspace_code
)
insert into public.actors (
  id,
  role,
  status,
  display_name,
  workspace_code,
  contact_label,
  pin_hash,
  failed_pin_attempts,
  pin_locked_until,
  repeated_lockout_count,
  created_by_actor_id,
  claimed_at,
  last_login_at,
  created_at,
  updated_at
)
select
  seed.id,
  seed.role,
  seed.status,
  seed.display_name,
  seed.workspace_code,
  seed.contact_label,
  seed.pin_hash,
  seed.failed_pin_attempts,
  seed.pin_locked_until,
  seed.repeated_lockout_count,
  seed.created_by_actor_id,
  seed.claimed_at,
  seed.last_login_at,
  seed.created_at,
  seed.updated_at
from seed_data as seed
where not exists (
  select 1
  from public.actors as actors
  where actors.workspace_code = seed.workspace_code
);

commit;
