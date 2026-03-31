import { Router } from "express";
import { createDispute, getDispute, listDisputes, resolveDispute } from "../controllers/disputes.controller.js";
import { requireRole } from "../middleware/require-role.js";

export const disputesRouter = Router();

disputesRouter.post("/", createDispute);
disputesRouter.get("/", requireRole("ops_reviewer", "ops_admin"), listDisputes);
disputesRouter.get("/:id", getDispute);
disputesRouter.post("/:id/resolve", requireRole("ops_reviewer", "ops_admin"), resolveDispute);
