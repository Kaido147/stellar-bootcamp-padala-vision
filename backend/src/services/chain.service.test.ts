import test from "node:test";
import assert from "node:assert/strict";
import {
  Account,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TimeoutInfinite,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";

const { ChainService } = await import("./chain.service.js");

test("verifyReleaseTransaction confirms a matching v2 submit_release transaction", async () => {
  const contractId = "CBSGWQCBZ52XAN62HHPMYAVLF6DZBFPI4GDKI5ULKDXDUYQROKR7UXAB";
  const wallet = Keypair.random().publicKey();
  const orderId = "123";
  const nonce = "a".repeat(64);

  const envelopeXdr = buildReleaseTransactionXdr({
    wallet,
    contractId,
    orderId,
    nonce,
  });

  const service = new ChainService({
    fetchTransaction: async () => ({
      status: "SUCCESS",
      envelopeXdr,
      latestLedger: 654321,
    }),
  });

  const verified = await service.verifyReleaseTransaction({
    txHash: "tx-success-1",
    orderId,
    contractId,
    attestationNonce: nonce,
    submittedWallet: wallet,
    rpcUrl: "https://rpc.example",
    networkPassphrase: Networks.TESTNET,
  });

  assert.equal(verified.status, "confirmed");
  assert.equal(verified.orderId, orderId);
  assert.equal(verified.contractId, contractId);
  assert.equal(verified.attestationNonce, nonce);
  assert.equal(verified.submittedWallet, wallet);
  assert.equal(verified.ledger, 654321);
});

test("verifyReleaseTransaction rejects a mismatched nonce in the invoke args", async () => {
  const contractId = "CBSGWQCBZ52XAN62HHPMYAVLF6DZBFPI4GDKI5ULKDXDUYQROKR7UXAB";
  const wallet = Keypair.random().publicKey();
  const envelopeXdr = buildReleaseTransactionXdr({
    wallet,
    contractId,
    orderId: "123",
    nonce: "b".repeat(64),
  });

  const service = new ChainService({
    fetchTransaction: async () => ({
      status: "SUCCESS",
      envelopeXdr,
      latestLedger: 111,
    }),
  });

  await assert.rejects(
    service.verifyReleaseTransaction({
      txHash: "tx-fail-1",
      orderId: "123",
      contractId,
      attestationNonce: "c".repeat(64),
      submittedWallet: wallet,
      rpcUrl: "https://rpc.example",
      networkPassphrase: Networks.TESTNET,
    }),
    /did not match the persisted release intent/,
  );
});

test("verifyOrderActionTransaction confirms assign_rider with matching rider wallet", async () => {
  const contractId = "CBSGWQCBZ52XAN62HHPMYAVLF6DZBFPI4GDKI5ULKDXDUYQROKR7UXAB";
  const wallet = Keypair.random().publicKey();
  const riderWallet = Keypair.random().publicKey();
  const envelopeXdr = buildOrderActionTransactionXdr({
    wallet,
    contractId,
    orderId: "456",
    functionName: "assign_rider",
    extraArgs: [nativeToScVal(riderWallet, { type: "address" })],
  });

  const service = new ChainService({
    fetchTransaction: async () => ({
      status: "SUCCESS",
      envelopeXdr,
      latestLedger: 333,
    }),
  });

  const verified = await service.verifyOrderActionTransaction({
    txHash: "tx-assign-1",
    orderId: "456",
    contractId,
    method: "assign_rider",
    submittedWallet: wallet,
    riderWallet,
    rpcUrl: "https://rpc.example",
    networkPassphrase: Networks.TESTNET,
  });

  assert.equal(verified.status, "confirmed");
  assert.equal(verified.riderWallet, riderWallet);
});

function buildReleaseTransactionXdr(input: {
  wallet: string;
  contractId: string;
  orderId: string;
  nonce: string;
}) {
  const account = new Account(input.wallet, "1");
  return new TransactionBuilder(account, {
    fee: String(BASE_FEE),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: input.contractId,
        function: "submit_release",
        args: [
          nativeToScVal(BigInt(input.orderId), { type: "u64" }),
          nativeToScVal("APPROVE", { type: "symbol" }),
          nativeToScVal(9_500, { type: "u32" }),
          nativeToScVal(1_774_952_430n, { type: "u64" }),
          nativeToScVal(1_774_953_330n, { type: "u64" }),
          nativeToScVal(input.nonce, { type: "string" }),
          nativeToScVal(input.contractId, { type: "string" }),
          nativeToScVal("staging", { type: "string" }),
          nativeToScVal(Buffer.alloc(64), { type: "bytes" }),
        ],
      }),
    )
    .setTimeout(TimeoutInfinite)
    .build()
    .toXDR();
}

function buildOrderActionTransactionXdr(input: {
  wallet: string;
  contractId: string;
  orderId: string;
  functionName: "fund_order" | "assign_rider" | "mark_in_transit" | "refund_order";
  extraArgs?: ReturnType<typeof nativeToScVal>[];
}) {
  const account = new Account(input.wallet, "1");
  return new TransactionBuilder(account, {
    fee: String(BASE_FEE),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: input.contractId,
        function: input.functionName,
        args: [nativeToScVal(BigInt(input.orderId), { type: "u64" }), ...(input.extraArgs ?? [])],
      }),
    )
    .setTimeout(TimeoutInfinite)
    .build()
    .toXDR();
}
