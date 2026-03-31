import { Router } from "express";
import { createRefundIntent, recordRefund } from "../controllers/refunds.controller.js";

export const refundsRouter = Router();

refundsRouter.post("/intent", createRefundIntent);
refundsRouter.post("/", recordRefund);
