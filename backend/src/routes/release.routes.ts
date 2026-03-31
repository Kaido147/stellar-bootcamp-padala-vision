import { Router } from "express";
import { createReleaseIntent } from "../controllers/release.controller.js";

export const releaseRouter = Router();

releaseRouter.post("/intent", createReleaseIntent);
