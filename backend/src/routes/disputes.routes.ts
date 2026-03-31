import { Router } from "express";
import { createDispute, resolveDispute } from "../controllers/disputes.controller.js";
import { requireRole } from "../middleware/require-role.js";

export const disputesRouter = Router();

disputesRouter.post("/", createDispute);
disputesRouter.post("/:id/resolve", requireRole("ops_reviewer", "ops_admin"), resolveDispute);
