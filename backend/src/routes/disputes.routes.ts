import { Router } from "express";
import { createDispute } from "../controllers/disputes.controller.js";

export const disputesRouter = Router();

disputesRouter.post("/", createDispute);
