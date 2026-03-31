import { Router } from "express";
import { reconcileOrder } from "../controllers/reconcile.controller.js";

export const reconcileRouter = Router();

reconcileRouter.post("/orders/:id", reconcileOrder);
