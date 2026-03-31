import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { disputesRouter } from "./disputes.routes.js";
import { refundsRouter } from "./refunds.routes.js";
import { releaseRouter } from "./release.routes.js";
import {
  acceptJob,
  createOrder,
  fundOrder,
  getOrder,
  getOrderHistory,
  listFundedJobs,
  markInTransit,
  submitEvidence,
  uploadEvidenceFile,
  evidenceUploadMiddleware,
} from "../controllers/orders.controller.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/disputes", disputesRouter);
apiRouter.use("/refunds", refundsRouter);
apiRouter.use("/release", releaseRouter);
apiRouter.post("/orders", createOrder);
apiRouter.get("/orders/:id", getOrder);
apiRouter.get("/orders/:id/history", getOrderHistory);
apiRouter.post("/orders/:id/fund", fundOrder);
apiRouter.post("/orders/:id/accept", acceptJob);
apiRouter.post("/orders/:id/in-transit", markInTransit);
apiRouter.get("/jobs/funded", listFundedJobs);
apiRouter.post("/evidence/upload", evidenceUploadMiddleware.single("file"), uploadEvidenceFile);
apiRouter.post("/evidence/submit", submitEvidence);
