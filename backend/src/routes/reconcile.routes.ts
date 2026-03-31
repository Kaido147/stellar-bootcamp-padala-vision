import { Router } from "express";
import { reconcileOrder } from "../controllers/reconcile.controller.js";
import { requireRole } from "../middleware/require-role.js";

export const reconcileRouter = Router();

reconcileRouter.post("/orders/:id", requireRole("ops_reviewer", "ops_admin"), reconcileOrder);
