import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { disputesRouter } from "./disputes.routes.js";
import { refundsRouter } from "./refunds.routes.js";
import { reconcileRouter } from "./reconcile.routes.js";
import { releaseRouter } from "./release.routes.js";
import { reviewsRouter } from "./reviews.routes.js";
import {
  acceptJob,
  createFundIntent,
  createInTransitIntent,
  createOrder,
  createRiderAssignIntent,
  fundOrder,
  getOrder,
  getOrderHistory,
  listFundedJobs,
  markInTransit,
  recordRiderAssign,
  submitEvidence,
  uploadEvidenceFile,
  evidenceUploadMiddleware,
} from "../controllers/orders.controller.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/disputes", disputesRouter);
apiRouter.use("/refunds", refundsRouter);
apiRouter.use("/reconcile", reconcileRouter);
apiRouter.use("/release", releaseRouter);
apiRouter.use("/reviews", reviewsRouter);
apiRouter.post("/orders", createOrder);
apiRouter.get("/orders/:id", getOrder);
apiRouter.get("/orders/:id/history", getOrderHistory);
apiRouter.post("/orders/:id/fund/intent", createFundIntent);
apiRouter.post("/orders/:id/fund", fundOrder);
apiRouter.post("/orders/:id/accept", acceptJob);
apiRouter.post("/orders/:id/rider-assign/intent", createRiderAssignIntent);
apiRouter.post("/orders/:id/rider-assign", recordRiderAssign);
apiRouter.post("/orders/:id/in-transit/intent", createInTransitIntent);
apiRouter.post("/orders/:id/in-transit", markInTransit);
apiRouter.get("/jobs/funded", listFundedJobs);
apiRouter.post("/evidence/upload", evidenceUploadMiddleware.single("file"), uploadEvidenceFile);
apiRouter.post("/evidence/submit", submitEvidence);
