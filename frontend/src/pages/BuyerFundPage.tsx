import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  BuyerCreateFundingIntentResponse,
  BuyerOrderDetailResponse,
  FundingTokenMetadata,
} from "@padala-vision/shared";
import { parseTokenAmountToBaseUnits } from "@padala-vision/shared";
import { Card } from "../components/Card";
import { KeyValueList } from "../components/KeyValueList";
import { LoadState } from "../components/LoadState";
import { formatDateTime } from "../lib/format";
import { workflowApi } from "../lib/api";
import { useWallet } from "../hooks/useWallet";
import {
  loadHorizonAccount,
  prepareTrustlineTransaction,
  submitClassicTransaction,
} from "../lib/stellar";
import {
  prepareContractInvocation,
  submitPreparedTransaction,
  toU64ScVal,
  waitForTransactionFinality,
} from "../lib/soroban";

type CheckState = "ready" | "action_required" | "blocked";

interface FundingCheck {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

interface FundingReadiness {
  loading: boolean;
  readyToFund: boolean;
  checks: FundingCheck[];
  trustlinePresent: boolean;
  issuerAvailable: boolean;
  tokenBalanceEnough: boolean;
  xlmBalanceEnough: boolean;
}

const RECOMMENDED_XLM_BALANCE = 2;

export function BuyerFundPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const wallet = useWallet();
  const [detail, setDetail] = useState<BuyerOrderDetailResponse | null>(null);
  const [intent, setIntent] = useState<BuyerCreateFundingIntentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [setupBusy, setSetupBusy] = useState<"trustline" | "topup" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<FundingReadiness | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Order id is missing.");
      return;
    }

    const orderId = id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextDetail = await workflowApi.getBuyerWorkflowOrder(orderId);
        const nextIntent =
          nextDetail.order.status === "awaiting_funding" || nextDetail.order.status === "funding_failed"
            ? await workflowApi.createBuyerFundingIntent(orderId)
            : null;

        if (!cancelled) {
          setDetail(nextDetail);
          setIntent(nextIntent);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not prepare funding flow.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  useEffect(() => {
    if (!intent || !detail) {
      setReadiness(null);
      return;
    }

    const activeIntent = intent;
    const activeDetail = detail;
    let cancelled = false;

    async function evaluate() {
      setReadiness((previous) => ({
        loading: true,
        readyToFund: previous?.readyToFund ?? false,
        checks: previous?.checks ?? [],
        trustlinePresent: previous?.trustlinePresent ?? false,
        issuerAvailable: previous?.issuerAvailable ?? false,
        tokenBalanceEnough: previous?.tokenBalanceEnough ?? false,
        xlmBalanceEnough: previous?.xlmBalanceEnough ?? false,
      }));

      try {
        const nextReadiness = await inspectFundingReadiness({
          walletAddress: wallet.address,
          walletNetworkPassphrase: wallet.networkPassphrase,
          intent: activeIntent,
          totalAmount: activeDetail.order.totalAmount,
        });

        if (!cancelled) {
          setReadiness(nextReadiness);
        }
      } catch (nextError) {
        if (!cancelled) {
          setReadiness({
            loading: false,
            readyToFund: false,
            trustlinePresent: false,
            issuerAvailable: false,
            tokenBalanceEnough: false,
            xlmBalanceEnough: false,
            checks: [
              {
                id: "readiness_unavailable",
                label: "Readiness lookup",
                state: "blocked",
                detail: nextError instanceof Error ? nextError.message : "Could not inspect wallet readiness.",
              },
            ],
          });
        }
      }
    }

    void evaluate();

    return () => {
      cancelled = true;
    };
  }, [detail, intent, refreshKey, wallet.address, wallet.networkPassphrase]);

  const token = intent?.token ?? null;
  const tokenSymbol = token?.symbol ?? token?.assetCode ?? "token";
  const existingFundingTxHash = detail?.order.chain?.fundingTxHash ?? intent?.existingFundingTxHash ?? null;
  const canAttemptTrustline =
    Boolean(intent) &&
    Boolean(wallet.address) &&
    wallet.networkPassphrase === intent?.networkPassphrase &&
    wallet.address === intent?.buyerWallet &&
    Boolean(token?.assetCode) &&
    Boolean(token?.assetIssuer) &&
    readiness?.issuerAvailable === true &&
    readiness?.trustlinePresent === false;
  const canRequestTopUp =
    Boolean(intent?.setup.demoTopUpAvailable) &&
    Boolean(wallet.address) &&
    wallet.networkPassphrase === intent?.networkPassphrase &&
    wallet.address === intent?.buyerWallet &&
    readiness?.issuerAvailable === true &&
    readiness?.trustlinePresent === true &&
    readiness?.tokenBalanceEnough === false;
  const fundingBlocked = Boolean(intent) && (readiness?.loading !== false || readiness?.readyToFund !== true);

  if (!detail) {
    return <LoadState error={error} loading={loading} />;
  }

  return (
    <div className="space-y-4">
      <Card
        subtitle="Funding remains a real Soroban contract call. The app now checks token readiness first so common setup issues are explained before you hit a raw chain error."
        title={`Fund ${detail.order.orderCode}`}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryChip label="Seller" value={detail.order.seller.displayName} />
          <SummaryChip label="Escrow total" value={`${detail.order.totalAmount} ${tokenSymbol}`} />
          <SummaryChip label="Funding deadline" value={formatDateTime(detail.order.fundingDeadlineAt)} />
        </div>
      </Card>

      <Card title="Funding Intent" subtitle="Live contract metadata resolved from the active contract registry row.">
        <KeyValueList
          items={[
            { label: "Method", value: intent?.method ?? "fund_order" },
            { label: "Escrow contract", value: intent?.contractId ?? detail.order.chain?.contractId ?? "Unavailable" },
            { label: "Token contract", value: intent?.token.contractId ?? "Unavailable" },
            { label: "Token asset", value: describeTokenAsset(token) },
            { label: "Token admin", value: token?.adminAddress ?? "Unavailable" },
            { label: "On-chain order id", value: intent?.onChainOrderId ?? detail.order.chain?.onChainOrderId ?? "Unavailable" },
            { label: "RPC URL", value: intent?.rpcUrl ?? "Unavailable" },
            { label: "Funding tx", value: existingFundingTxHash ?? "Not submitted yet" },
          ]}
        />
        {detail.order.chain?.lastChainError ? (
          <div className="surface-card p-4 text-sm text-red-700">{detail.order.chain.lastChainError}</div>
        ) : null}
      </Card>

      {intent ? (
        <Card title="Wallet Readiness" subtitle={`The buyer wallet must be ready for ${tokenSymbol} before funding can succeed.`}>
          {notice ? <Notice tone="success">{notice}</Notice> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {readiness?.checks?.length ? (
            <div className="space-y-3">
              {readiness.checks.map((check) => (
                <FundingCheckRow key={check.id} check={check} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-ink/64">{readiness?.loading ? "Checking wallet readiness..." : "Connect the buyer wallet to begin readiness checks."}</div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {canAttemptTrustline ? (
              <button
                className="btn-secondary px-4 py-2"
                disabled={setupBusy !== null}
                onClick={() => {
                  if (!wallet.address || !intent || !token?.assetCode || !token.assetIssuer) {
                    return;
                  }

                  const buyerAddress = wallet.address;
                  const assetCode = token.assetCode;
                  const assetIssuer = token.assetIssuer;
                  setSetupBusy("trustline");
                  setError(null);
                  setNotice(null);

                  void (async () => {
                    const transaction = await prepareTrustlineTransaction({
                      sourceAddress: buyerAddress,
                      networkPassphrase: intent.networkPassphrase,
                      assetCode,
                      assetIssuer,
                    });
                    const signed = await wallet.signTransaction(transaction.toXDR());
                    await submitClassicTransaction({
                      signedTxXdr: signed,
                      networkPassphrase: intent.networkPassphrase,
                    });
                    setNotice(`Trustline added for ${assetCode}.`);
                    setRefreshKey((value) => value + 1);
                  })()
                    .catch((nextError) => {
                      setError(mapSetupError(nextError, token, detail.order.totalAmount));
                    })
                    .finally(() => setSetupBusy(null));
                }}
                type="button"
              >
                {setupBusy === "trustline" ? `Adding ${token?.assetCode ?? tokenSymbol} trustline...` : `Add ${token?.assetCode ?? tokenSymbol} trustline`}
              </button>
            ) : null}

            {canRequestTopUp ? (
              <button
                className="btn-secondary px-4 py-2"
                disabled={setupBusy !== null}
                onClick={() => {
                  if (!id) {
                    return;
                  }

                  setSetupBusy("topup");
                  setError(null);
                  setNotice(null);

                  void workflowApi
                    .requestBuyerFundingTopUp(id)
                    .then((result) => {
                      setNotice(
                        result.status === "minted"
                          ? `Minted ${result.mintedAmount} ${result.token.symbol} to the buyer wallet on testnet.`
                          : `Buyer wallet already has enough ${result.token.symbol} to fund this order.`,
                      );
                      setRefreshKey((value) => value + 1);
                    })
                    .catch((nextError) => {
                      setError(mapSetupError(nextError, token, detail.order.totalAmount));
                    })
                    .finally(() => setSetupBusy(null));
                }}
                type="button"
              >
                {setupBusy === "topup" ? `Requesting ${tokenSymbol} top-up...` : `Request testnet ${tokenSymbol}`}
              </button>
            ) : null}

            {intent?.setup.xlmFriendbotUrl ? (
              <a className="btn-secondary px-4 py-2" href={intent.setup.xlmFriendbotUrl} rel="noreferrer" target="_blank">
                Open Friendbot
              </a>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card title="Fund Escrow" subtitle="Sign the real `fund_order` transaction in Freighter. The order stays unfunded until backend verification confirms chain success.">
        {intent ? (
          <div className="mb-4 text-sm text-ink/70">
            {fundingBlocked
              ? `Complete the ${tokenSymbol} readiness checks above before funding.`
              : `Wallet setup looks good. You can now submit the real ${tokenSymbol} funding transaction.`}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            disabled={busy || fundingBlocked}
            onClick={() => {
              if (!id) {
                return;
              }

              setBusy(true);
              setError(null);
              setNotice(null);

              void (async () => {
                if (!intent) {
                  if (!existingFundingTxHash || !detail.order.chain?.buyerWallet) {
                    throw new Error("Funding cannot be retried from the current order state.");
                  }

                  const result = await workflowApi.confirmBuyerFunding(id, {
                    txHash: existingFundingTxHash,
                    submittedWallet: detail.order.chain.buyerWallet,
                  });
                  if (result.status === "funded") {
                    navigate(`/buyer/orders/${id}`);
                    return;
                  }
                  throw new Error(
                    result.status === "funding_failed"
                      ? "The last funding transaction failed on chain. Fix the wallet setup and create a new funding attempt."
                      : "Funding is still pending confirmation on chain.",
                  );
                }

                const address = wallet.address ?? (await wallet.connectWallet());
                if (wallet.networkPassphrase !== intent.networkPassphrase) {
                  throw new Error("Switch Freighter to Stellar testnet before funding escrow.");
                }
                if (address !== intent.buyerWallet) {
                  throw new Error("The connected wallet does not match the buyer wallet assigned to this order.");
                }

                const prepared = await prepareContractInvocation({
                  rpcUrl: intent.rpcUrl,
                  networkPassphrase: intent.networkPassphrase,
                  sourceAddress: address,
                  contractId: intent.contractId,
                  functionName: intent.method,
                  args: [toU64ScVal(BigInt(intent.onChainOrderId))],
                });
                const signedTxXdr = await wallet.signTransaction(prepared.toXDR());
                const submitted = await submitPreparedTransaction({
                  rpcUrl: intent.rpcUrl,
                  networkPassphrase: intent.networkPassphrase,
                  signedTxXdr,
                });
                await waitForTransactionFinality({
                  server: submitted.server,
                  txHash: submitted.txHash,
                });
                const result = await workflowApi.confirmBuyerFunding(id, {
                  actionIntentId: intent.actionIntentId,
                  txHash: submitted.txHash,
                  submittedWallet: address,
                });
                if (result.status !== "funded") {
                  throw new Error("Funding did not confirm on chain.");
                }
                navigate(`/buyer/orders/${id}`);
              })()
                .catch((nextError) => {
                  setError(mapSetupError(nextError, token, detail.order.totalAmount));
                })
                .finally(() => setBusy(false));
            }}
            type="button"
          >
            {busy ? "Funding..." : detail.order.status === "funding_pending" ? "Refresh funding status" : `Fund with ${tokenSymbol}`}
          </button>
          <Link className="btn-secondary px-4 py-2" to={`/buyer/orders/${detail.order.orderId}`}>
            Back to order
          </Link>
        </div>
      </Card>
    </div>
  );
}

async function inspectFundingReadiness(input: {
  walletAddress: string | null;
  walletNetworkPassphrase: string | null;
  intent: BuyerCreateFundingIntentResponse;
  totalAmount: string;
}): Promise<FundingReadiness> {
  const checks: FundingCheck[] = [];
  const token = input.intent.token;

  if (!input.walletAddress) {
    checks.push({
      id: "wallet_connected",
      label: "Freighter connected",
      state: "action_required",
      detail: "Connect the buyer wallet in Freighter before funding.",
    });

    return {
      loading: false,
      readyToFund: false,
      checks,
      trustlinePresent: false,
      issuerAvailable: false,
      tokenBalanceEnough: false,
      xlmBalanceEnough: false,
    };
  }

  checks.push({
    id: "wallet_connected",
    label: "Freighter connected",
    state: "ready",
    detail: `${truncateWallet(input.walletAddress)} is connected.`,
  });

  const correctNetwork = input.walletNetworkPassphrase === input.intent.networkPassphrase;
  checks.push({
    id: "network",
    label: "Correct network",
    state: correctNetwork ? "ready" : "action_required",
    detail: correctNetwork
      ? "Freighter is already on Stellar testnet."
      : "Switch Freighter to Stellar testnet before signing.",
  });

  const correctWallet = input.walletAddress === input.intent.buyerWallet;
  checks.push({
    id: "buyer_wallet",
    label: "Assigned buyer wallet",
    state: correctWallet ? "ready" : "action_required",
    detail: correctWallet
      ? "The connected wallet matches the buyer wallet stored on the order."
      : `Use the assigned buyer wallet ${truncateWallet(input.intent.buyerWallet)}.`,
  });

  if (!correctNetwork || !correctWallet) {
    return {
      loading: false,
      readyToFund: false,
      checks,
      trustlinePresent: false,
      issuerAvailable: false,
      tokenBalanceEnough: false,
      xlmBalanceEnough: false,
    };
  }

  const account = await loadHorizonAccount(input.walletAddress, input.intent.networkPassphrase).catch(() => null);
  if (!account) {
    checks.push({
      id: "wallet_exists",
      label: "Buyer wallet funded on testnet",
      state: "action_required",
      detail: "This wallet is not active on Stellar testnet yet. Fund it with Friendbot first.",
    });

    return {
      loading: false,
      readyToFund: false,
      checks,
      trustlinePresent: false,
      issuerAvailable: false,
      tokenBalanceEnough: false,
      xlmBalanceEnough: false,
    };
  }

  const nativeBalance = Number(account.balances.find((balance) => balance.asset_type === "native")?.balance ?? "0");
  const xlmBalanceEnough = nativeBalance >= RECOMMENDED_XLM_BALANCE;
  checks.push({
    id: "xlm_balance",
    label: "XLM reserve and fees",
    state: xlmBalanceEnough ? "ready" : "action_required",
    detail: xlmBalanceEnough
      ? `${nativeBalance.toFixed(2)} XLM is available for reserve and fees.`
      : `This wallet only has ${nativeBalance.toFixed(2)} XLM. Keep at least ${RECOMMENDED_XLM_BALANCE.toFixed(1)} XLM for trustline reserve and transaction fees.`,
  });

  const assetIssuer = token.assetIssuer;
  const assetCode = token.assetCode ?? token.symbol;
  let issuerAvailable = true;

  if (token.trustlineRequired && assetIssuer) {
    issuerAvailable = Boolean(await loadHorizonAccount(assetIssuer, input.intent.networkPassphrase).catch(() => null));
    checks.push({
      id: "issuer",
      label: `${assetCode} issuer on testnet`,
      state: issuerAvailable ? "ready" : "blocked",
      detail: issuerAvailable
        ? `${truncateWallet(assetIssuer)} is live and can support ${assetCode} trustlines.`
        : `The configured ${assetCode} issuer account is not active on Stellar testnet, so buyers cannot complete trustline setup.`,
    });
  }

  const trustline = account.balances.find(
    (balance) =>
      "asset_code" in balance &&
      balance.asset_code === token.assetCode &&
      "asset_issuer" in balance &&
      balance.asset_issuer === token.assetIssuer,
  );
  const trustlinePresent = token.trustlineRequired ? Boolean(trustline) : true;

  checks.push({
    id: "trustline",
    label: `${assetCode} trustline`,
    state: !token.trustlineRequired
      ? "ready"
      : trustlinePresent
        ? "ready"
        : issuerAvailable
          ? "action_required"
          : "blocked",
    detail: !token.trustlineRequired
      ? "This token contract does not require a classic Stellar trustline."
      : trustlinePresent
        ? `${assetCode} trustline is already present on the buyer wallet.`
        : `Add a trustline for ${assetCode}:${token.assetIssuer ?? "unknown issuer"} before funding.`,
  });

  const currentTokenBalance = trustline?.balance ?? "0";
  const tokenBalanceEnough = trustlinePresent
    ? parseTokenAmountToBaseUnits(currentTokenBalance, token.decimals) >=
      parseTokenAmountToBaseUnits(input.totalAmount, token.decimals)
    : false;

  checks.push({
    id: "token_balance",
    label: `${assetCode} balance`,
    state: trustlinePresent
      ? tokenBalanceEnough
        ? "ready"
        : "action_required"
      : issuerAvailable
        ? "blocked"
        : "blocked",
    detail: trustlinePresent
      ? tokenBalanceEnough
        ? `${currentTokenBalance} ${assetCode} is available for funding.`
        : `${currentTokenBalance} ${assetCode} is available, but this order needs ${input.totalAmount} ${assetCode}.`
      : `Token balance cannot be used until the ${assetCode} trustline is added.`,
  });

  const readyToFund = checks.every((check) => check.state === "ready");

  return {
    loading: false,
    readyToFund,
    checks,
    trustlinePresent,
    issuerAvailable,
    tokenBalanceEnough,
    xlmBalanceEnough,
  };
}

function mapSetupError(error: unknown, token: FundingTokenMetadata | null, totalAmount: string) {
  const message = error instanceof Error ? error.message : String(error);
  const tokenCode = token?.assetCode ?? token?.symbol ?? "token";

  if (message.includes("trustline entry is missing")) {
    return `Add the ${tokenCode} trustline before funding this order.`;
  }
  if (message.includes("op_no_issuer")) {
    return `The configured ${tokenCode} issuer account is not active on Stellar testnet yet, so trustline setup cannot complete.`;
  }
  if (/insufficient|balance is not sufficient/i.test(message)) {
    return `The buyer wallet needs at least ${totalAmount} ${tokenCode} before funding can succeed.`;
  }
  if (message.includes("workflow_token_trustline_required")) {
    return `Add the ${tokenCode} trustline before requesting test tokens.`;
  }
  if (message.includes("Timed out")) {
    return "The transaction was submitted, but confirmation is still pending. Refresh the funding page in a moment.";
  }

  return message;
}

function describeTokenAsset(token: FundingTokenMetadata | null) {
  if (!token) {
    return "Unavailable";
  }
  if (token.assetCode && token.assetIssuer) {
    return `${token.assetCode}:${token.assetIssuer}`;
  }

  return token.name;
}

function truncateWallet(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function FundingCheckRow({ check }: { check: FundingCheck }) {
  return (
    <div className="surface-card flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="text-sm font-semibold text-ink">{check.label}</div>
        <div className="mt-1 text-sm text-ink/68">{check.detail}</div>
      </div>
      <StatusPill state={check.state} />
    </div>
  );
}

function StatusPill({ state }: { state: CheckState }) {
  const label = state === "ready" ? "Ready" : state === "action_required" ? "Action Required" : "Blocked";
  const className =
    state === "ready"
      ? "bg-emerald-600 text-white"
      : state === "action_required"
        ? "bg-amber-500 text-white"
        : "bg-red-600 text-white";

  return <div className={`quiet-pill whitespace-nowrap ${className}`}>{label}</div>;
}

function Notice({ children, tone }: { children: string; tone: "success" | "error" }) {
  const className =
    tone === "success"
      ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
      : "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700";

  return <div className={`${className} mb-4`}>{children}</div>;
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/42">{label}</div>
      <div className="mt-2 text-sm text-ink/78">{value}</div>
    </div>
  );
}
