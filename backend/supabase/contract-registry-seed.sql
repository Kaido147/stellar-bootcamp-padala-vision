begin;

update public.contract_registry
set
  status = 'inactive',
  updated_at = now()
where environment = 'staging'
  and status = 'active'
  and id <> '55ce98af-4c66-4ee1-a9a7-d549cd0974f4'::uuid;

insert into public.contract_registry (
  id,
  environment,
  escrow_contract_id,
  token_contract_id,
  oracle_public_key,
  rpc_url,
  network_passphrase,
  status,
  contract_version,
  interface_version,
  wasm_hash,
  deployment_label,
  deployed_at,
  activated_at
)
values (
  '55ce98af-4c66-4ee1-a9a7-d549cd0974f4'::uuid,
  'staging',
  'CCKMN5TB7ZOJVGI4NB3QDNCWOTZTVEFNOICTT5X52CMRXJPOFVU6OUX6',
  'CDXEE6G4HDZF3RXTON466XHBLKSJ4QVVHOSH5ELKSS4WKNWNU6C4QLQX',
  '0fb15da1b2132533388b49504f541e4a91210e3f65d491be7ec5dd594c33fa7a',
  'https://soroban-testnet.stellar.org',
  'Test SDF Network ; September 2015',
  'active',
  'v2',
  'soroban-v2',
  null,
  'public-demo',
  now(),
  now()
)
on conflict (id) do update
set
  environment = excluded.environment,
  escrow_contract_id = excluded.escrow_contract_id,
  token_contract_id = excluded.token_contract_id,
  oracle_public_key = excluded.oracle_public_key,
  rpc_url = excluded.rpc_url,
  network_passphrase = excluded.network_passphrase,
  status = excluded.status,
  contract_version = excluded.contract_version,
  interface_version = excluded.interface_version,
  wasm_hash = excluded.wasm_hash,
  deployment_label = excluded.deployment_label,
  deployed_at = excluded.deployed_at,
  activated_at = excluded.activated_at,
  updated_at = now();

commit;
