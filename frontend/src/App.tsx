import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { BindWalletPage } from "./pages/BindWalletPage";
import { BuyerHomePage } from "./pages/BuyerHomePage";
import { BuyerFundPage } from "./pages/BuyerFundPage";
import { LandingPage } from "./pages/LandingPage";
import { OperatorDisputeDetailPage, OperatorDisputesPage } from "./pages/OperatorDisputesPage";
import { OperatorReviewDetailPage, OperatorReviewsPage } from "./pages/OperatorReviewsPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { RiderEvidencePage } from "./pages/RiderEvidencePage";
import { RiderJobPage } from "./pages/RiderJobPage";
import { RiderJobsPage } from "./pages/RiderJobsPage";
import { SellerNewOrderPage } from "./pages/SellerNewOrderPage";
import { SettingsNetworkPage } from "./pages/SettingsNetworkPage";
import { RoleGuard } from "./routes/RoleGuard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Navigate replace to="/" />} />
      <Route path="/" element={<AppLayout />}>
        <Route path="bind-wallet" element={<BindWalletPage />} />
        <Route path="settings/network" element={<SettingsNetworkPage />} />

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
        <Route
          path="rider/jobs/:id/evidence"
          element={
            <RoleGuard roles={["rider"]}>
              <RiderEvidencePage />
            </RoleGuard>
          }
        />

        <Route path="orders/:id/timeline" element={<OrderDetailPage audience="timeline" />} />
        <Route path="disputes/:id" element={<OperatorDisputeDetailPage participantView />} />

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
  );
}
