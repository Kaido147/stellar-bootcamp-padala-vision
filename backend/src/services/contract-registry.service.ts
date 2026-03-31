import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";
import { repository, type ContractRegistryRecord } from "../lib/repository.js";

export interface ResolvedContractSet {
  registryId: string;
  environment: "staging" | "pilot";
  contractId: string;
  tokenContractId: string;
  oraclePublicKey: string;
  rpcUrl: string;
  networkPassphrase: string;
}

export class ContractRegistryService {
  async resolveActiveContractSet(environment: "staging" | "pilot" = env.APP_ENV): Promise<ResolvedContractSet> {
    const record = await repository.getActiveContractRegistry(environment);

    if (!record) {
      throw new HttpError(
        503,
        `No active contract registry row is configured for ${environment}`,
        "contract_registry_missing",
      );
    }

    return mapResolvedContractSet(record);
  }
}

export async function seedContractRegistry(input: {
  environment: "staging" | "pilot";
  escrowContractId: string;
  tokenContractId: string;
  oraclePublicKey: string;
  rpcUrl: string;
  networkPassphrase: string;
  status?: "active" | "inactive";
}) {
  return repository.createContractRegistry({
    id: randomUUID(),
    environment: input.environment,
    escrowContractId: input.escrowContractId,
    tokenContractId: input.tokenContractId,
    oraclePublicKey: input.oraclePublicKey,
    rpcUrl: input.rpcUrl,
    networkPassphrase: input.networkPassphrase,
    status: input.status ?? "active",
  });
}

export async function clearContractRegistry(environment?: "staging" | "pilot") {
  await repository.clearContractRegistry(environment);
}

function mapResolvedContractSet(record: ContractRegistryRecord): ResolvedContractSet {
  return {
    registryId: record.id,
    environment: record.environment,
    contractId: record.escrowContractId,
    tokenContractId: record.tokenContractId,
    oraclePublicKey: record.oraclePublicKey,
    rpcUrl: record.rpcUrl,
    networkPassphrase: record.networkPassphrase,
  };
}
