import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { RoleGuard } from "./routes/RoleGuard";

const LandingPage = lazy(() => import("./pages/LandingPage").then((module) => ({ default: module.LandingPage })));
const AppLayoutPage = AppLayout;
const SessionEntryPage = lazy(() => import("./pages/SessionEntryPage").then((module) => ({ default: module.SessionEntryPage })));
const BuyerInviteClaimPage = lazy(() => import("./pages/BuyerInviteClaimPage").then((module) => ({ default: module.BuyerInviteClaimPage })));
const DeliveryConfirmationPage = lazy(() => import("./pages/DeliveryConfirmationPage").then((module) => ({ default: module.DeliveryConfirmationPage })));
const BindWalletPage = lazy(() => import("./pages/BindWalletPage").then((module) => ({ default: module.BindWalletPage })));
const SettingsNetworkPage = lazy(() => import("./pages/SettingsNetworkPage").then((module) => ({ default: module.SettingsNetworkPage })));
const SellerWorkspacePage = lazy(() => import("./pages/SellerWorkspacePage").then((module) => ({ default: module.SellerWorkspacePage })));
const SellerNewOrderPage = lazy(() => import("./pages/SellerNewOrderPage").then((module) => ({ default: module.SellerNewOrderPage })));
const BuyerHomePage = lazy(() => import("./pages/BuyerHomePage").then((module) => ({ default: module.BuyerHomePage })));
const BuyerFundPage = lazy(() => import("./pages/BuyerFundPage").then((module) => ({ default: module.BuyerFundPage })));
const RiderJobsPage = lazy(() => import("./pages/RiderJobsPage").then((module) => ({ default: module.RiderJobsPage })));
const RiderJobPage = lazy(() => import("./pages/RiderJobPage").then((module) => ({ default: module.RiderJobPage })));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage").then((module) => ({ default: module.OrderDetailPage })));
const OperatorReviewsPage = lazy(() => import("./pages/OperatorReviewsPage").then((module) => ({ default: module.OperatorReviewsPage })));
const OperatorReviewDetailPage = lazy(() =>
  import("./pages/OperatorReviewsPage").then((module) => ({ default: module.OperatorReviewDetailPage })),
);
const OperatorDisputesPage = lazy(() =>
  import("./pages/OperatorDisputesPage").then((module) => ({ default: module.OperatorDisputesPage })),
);
const OperatorDisputeDetailPage = lazy(() =>
  import("./pages/OperatorDisputesPage").then((module) => ({ default: module.OperatorDisputeDetailPage })),
);

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/" element={<AppLayoutPage />}>
          <Route path="enter/:role" element={<SessionEntryPage />} />
          <Route path="buyer/claim/:token" element={<BuyerInviteClaimPage />} />
          <Route path="confirm/delivery/:token" element={<DeliveryConfirmationPage />} />
          <Route path="bind-wallet" element={<BindWalletPage />} />
          <Route path="settings/network" element={<SettingsNetworkPage />} />

          <Route
            path="seller"
            element={
              <RoleGuard roles={["seller"]}>
                <SellerWorkspacePage />
              </RoleGuard>
            }
          />
          <Route
            path="seller/orders/new"
            element={
              <RoleGuard roles={["seller"]}>
                <SellerNewOrderPage />
              </RoleGuard>
            }
          />
          <Route
            path="seller/orders/:id"
            element={
              <RoleGuard roles={["seller"]}>
                <OrderDetailPage audience="seller" />
              </RoleGuard>
            }
          />

          <Route
            path="buyer"
            element={
              <RoleGuard roles={["buyer"]}>
                <BuyerHomePage />
              </RoleGuard>
            }
          />
          <Route
            path="buyer/orders/:id/fund"
            element={
              <RoleGuard roles={["buyer"]}>
                <BuyerFundPage />
              </RoleGuard>
            }
          />
          <Route
            path="buyer/orders/:id"
            element={
              <RoleGuard roles={["buyer"]}>
                <OrderDetailPage audience="buyer" />
              </RoleGuard>
            }
          />

          <Route
            path="rider/jobs"
            element={
              <RoleGuard roles={["rider"]}>
                <RiderJobsPage />
              </RoleGuard>
            }
          />
          <Route
            path="rider/jobs/:id"
            element={
              <RoleGuard roles={["rider"]}>
                <RiderJobPage />
              </RoleGuard>
            }
          />
          <Route path="orders/:id" element={<OrderDetailPage audience="timeline" />} />

          <Route
            path="operator/reviews"
            element={
              <RoleGuard roles={["operator"]}>
                <OperatorReviewsPage />
              </RoleGuard>
            }
          />
          <Route
            path="operator/reviews/:orderId"
            element={
              <RoleGuard roles={["operator"]}>
                <OperatorReviewDetailPage />
              </RoleGuard>
            }
          />
          <Route
            path="operator/disputes"
            element={
              <RoleGuard roles={["operator"]}>
                <OperatorDisputesPage />
              </RoleGuard>
            }
          />
          <Route
            path="operator/disputes/:id"
            element={
              <RoleGuard roles={["operator"]}>
                <OperatorDisputeDetailPage />
              </RoleGuard>
            }
          />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-screen bg-shell px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="surface-panel p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-coral/72">Loading</div>
          <div className="mt-3 font-display text-3xl text-ink">Opening workspace</div>
          <div className="mt-2 text-sm text-ink/64">Loading the next workflow page and its operational data.</div>
        </div>
      </div>
    </div>
  );
}
