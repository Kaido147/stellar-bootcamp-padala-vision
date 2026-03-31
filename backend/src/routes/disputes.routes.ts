import { Router } from "express";
import { createDispute, resolveDispute } from "../controllers/disputes.controller.js";

export const disputesRouter = Router();

disputesRouter.post("/", createDispute);
disputesRouter.post("/:id/resolve", resolveDispute);
