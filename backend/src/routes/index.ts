import { Router } from "express";
import {
  acceptJob,
  createOrder,
  fundOrder,
  getOrder,
  getOrderHistory,
  listFundedJobs,
  markInTransit,
  releaseEscrow,
  submitEvidence,
  uploadEvidenceFile,
  evidenceUploadMiddleware,
} from "../controllers/orders.controller.js";

export const apiRouter = Router();

apiRouter.post("/orders", createOrder);
apiRouter.get("/orders/:id", getOrder);
apiRouter.get("/orders/:id/history", getOrderHistory);
apiRouter.post("/orders/:id/fund", fundOrder);
apiRouter.post("/orders/:id/accept", acceptJob);
apiRouter.post("/orders/:id/in-transit", markInTransit);
apiRouter.get("/jobs/funded", listFundedJobs);
apiRouter.post("/evidence/upload", evidenceUploadMiddleware.single("file"), uploadEvidenceFile);
apiRouter.post("/evidence/submit", submitEvidence);
apiRouter.post("/release", releaseEscrow);
