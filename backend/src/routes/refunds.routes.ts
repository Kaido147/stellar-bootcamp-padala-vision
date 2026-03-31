import { Router } from "express";
import { createRefundIntent } from "../controllers/refunds.controller.js";

export const refundsRouter = Router();

refundsRouter.post("/intent", createRefundIntent);
