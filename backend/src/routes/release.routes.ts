import { Router } from "express";
import { createReleaseIntent, recordRelease } from "../controllers/release.controller.js";

export const releaseRouter = Router();

releaseRouter.post("/", recordRelease);
releaseRouter.post("/intent", createReleaseIntent);
