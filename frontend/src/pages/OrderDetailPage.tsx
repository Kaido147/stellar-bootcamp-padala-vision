import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type {
  BuyerOrderDetailResponse,
  SellerOrderDetailResponse,
  SharedOrderDetailResponse,
} from "@padala-vision/shared";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { WorkflowOrderDetailContent } from "../components/WorkflowOrderDetailContent";
import { getRoleHomePath } from "../lib/roles";
import { workflowApi } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";

type Audience = "seller" | "buyer" | "timeline";

export function OrderDetailPage({ audience }: { audience: Audience }) {
  const { id } = useParams();
  const { actor, authReady } = useAuth();
  const [detail, setDetail] = useState<SellerOrderDetailResponse | BuyerOrderDetailResponse | SharedOrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (audience === "timeline" && !authReady) {
      return;
    }

    if (audience === "timeline" && !actor) {
      setLoading(false);
      setError(null);
      return;
    }

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
        const response =
          audience === "seller"
            ? await workflowApi.getSellerWorkflowOrder(orderId)
            : audience === "buyer"
              ? await workflowApi.getBuyerWorkflowOrder(orderId)
              : await workflowApi.getSharedWorkflowOrder(orderId);

        if (!cancelled) {
          setDetail(response);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load order detail.");
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
  }, [actor, audience, authReady, id]);

  if (audience === "timeline" && authReady && !actor) {
    return (
      <Card
        title="Re-enter your workspace"
        subtitle="Shared order links are now a compatibility path. Use your actor workspace to reopen the order safely."
      >
        <div className="surface-card p-4 text-sm leading-6 text-ink/68">
          This order link no longer acts as a primary entry path. Re-enter the correct workspace, then continue from your database-backed order list.
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="btn-primary px-4 py-2" to="/">
            Go to home
          </Link>
        </div>
      </Card>
    );
  }

  if (!detail) {
    return <LoadState error={error} loading={loading} />;
  }

  if (audience === "timeline") {
    const redirectPath = getSharedDetailRedirectPath(detail as SharedOrderDetailResponse);
    if (redirectPath) {
      return <Navigate replace to={redirectPath} />;
    }
  }

  const subtitle =
    audience === "seller"
      ? "Seller detail stays focused on buyer invite recovery, fulfillment visibility, and settlement state."
      : audience === "buyer"
        ? "Buyer detail stays focused on funding, proof review, and confirmation access."
        : "Shared order detail now exists only as a compatibility handoff back into the correct workspace.";

  const actions = (
    <div className="mt-4 flex flex-wrap gap-3">
      {audience === "seller" ? (
        <>
          {"buyerInviteActive" in detail ? (
            <button
              className="btn-secondary px-4 py-2"
              onClick={() => {
                void workflowApi
                  .reissueSellerBuyerInvite(detail.order.orderId)
                  .then((response) => {
                    setIssuedLink(`${window.location.origin}/buyer/claim/${response.buyerInvite.token}`);
                    setMessage("Buyer invite reissued.");
                  })
                  .catch((nextError) => {
                    setMessage(nextError instanceof Error ? nextError.message : "Could not reissue buyer invite.");
                  });
              }}
              type="button"
            >
              Reissue buyer invite
            </button>
          ) : null}
          {detail.order.status === "awaiting_funding" ? (
            <button
              className="btn-secondary px-4 py-2"
              onClick={() => {
                void workflowApi
                  .cancelSellerWorkflowOrder(detail.order.orderId)
                  .then(() => {
                    setMessage("Order cancelled.");
                  })
                  .catch((nextError) => {
                    setMessage(nextError instanceof Error ? nextError.message : "Could not cancel order.");
                  });
              }}
              type="button"
            >
              Cancel order
            </button>
          ) : null}
        </>
      ) : null}

      {audience === "buyer" ? (
        <>
          {detail.order.status === "awaiting_funding" ? (
            <Link className="btn-primary px-4 py-2" to={`/buyer/orders/${detail.order.orderId}/fund`}>
              Fund escrow
            </Link>
          ) : null}
          {"confirmationTokenActive" in detail ? (
            <button
              className="btn-secondary px-4 py-2"
              onClick={() => {
                void workflowApi
                  .reissueBuyerConfirmation(detail.order.orderId)
                  .then((response) => {
                    setIssuedLink(`${window.location.origin}/confirm/delivery/${response.deliveryConfirmation.token}`);
                    setMessage("Confirmation access reissued.");
                  })
                  .catch((nextError) => {
                    setMessage(nextError instanceof Error ? nextError.message : "Could not reissue confirmation.");
                  });
              }}
              type="button"
            >
              Reissue confirmation access
            </button>
          ) : null}
        </>
      ) : null}

      {audience === "timeline" && actor ? (
        <Link className="btn-primary px-4 py-2" to={getRoleHomePath(actor.role)}>
          Return to {actor.role} workspace
        </Link>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          audience === "seller"
            ? { label: "Seller workspace", to: "/seller" }
            : audience === "buyer"
              ? { label: "Buyer workspace", to: "/buyer" }
              : { label: "Compatibility order link" },
          { label: detail.order.orderCode },
        ]}
      />

      <WorkflowOrderDetailContent
        actions={actions}
        detail={detail}
        detailSubtitle={subtitle}
        detailTitle={detail.order.orderCode}
      />

      {issuedLink || message ? (
        <Card title="Action Output" subtitle="New links are shown only at issuance time.">
          {message ? <div className="surface-card p-4 text-sm text-ink/75">{message}</div> : null}
          {issuedLink ? <input className="field-input font-mono text-xs" readOnly value={issuedLink} /> : null}
        </Card>
      ) : null}
    </div>
  );
}

function getSharedDetailRedirectPath(detail: SharedOrderDetailResponse) {
  switch (detail.order.relation) {
    case "seller_owner":
      return `/seller/orders/${detail.order.orderId}`;
    case "buyer_owner":
      return `/buyer/orders/${detail.order.orderId}`;
    case "rider_owner":
      return `/rider/jobs/${detail.order.orderId}`;
    case "operator":
      return `/operator/reviews/${detail.order.orderId}`;
    default:
      return null;
  }
}
