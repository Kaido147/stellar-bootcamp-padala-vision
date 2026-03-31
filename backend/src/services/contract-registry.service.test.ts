import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.APP_ENV = "staging";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { ContractRegistryService, seedContractRegistry, clearContractRegistry } = await import("./contract-registry.service.js");

test("resolves the active contract set for the current environment only", async () => {
  await clearContractRegistry();
  const service = new ContractRegistryService();

  await seedContractRegistry({
    environment: "pilot",
    escrowContractId: "escrow-pilot",
    tokenContractId: "token-pilot",
    oraclePublicKey: "oracle-pilot",
    rpcUrl: "https://pilot-rpc.example",
    networkPassphrase: "Pilot Passphrase",
  });

  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const resolved = await service.resolveActiveContractSet("staging");

  assert.equal(resolved.environment, "staging");
  assert.equal(resolved.contractId, "escrow-staging");
  assert.equal(resolved.tokenContractId, "token-staging");
  assert.equal(resolved.rpcUrl, "https://staging-rpc.example");
});

test("fails safely when the environment has no active registry row", async () => {
  await clearContractRegistry();
  const service = new ContractRegistryService();

  await assert.rejects(service.resolveActiveContractSet("pilot"), /No active contract registry row is configured for pilot/);
});

test("activating a new row deactivates the old row in the same environment", async () => {
  await clearContractRegistry();
  const service = new ContractRegistryService();

  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-v1",
    tokenContractId: "token-v1",
    oraclePublicKey: "oracle-v1",
    rpcUrl: "https://staging-rpc-v1.example",
    networkPassphrase: "Staging Passphrase",
  });

  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-v2",
    tokenContractId: "token-v2",
    oraclePublicKey: "oracle-v2",
    rpcUrl: "https://staging-rpc-v2.example",
    networkPassphrase: "Staging Passphrase",
  });

  const resolved = await service.resolveActiveContractSet("staging");

  assert.equal(resolved.contractId, "escrow-v2");
  assert.equal(resolved.tokenContractId, "token-v2");
});
