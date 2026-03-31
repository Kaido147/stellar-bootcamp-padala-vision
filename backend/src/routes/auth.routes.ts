import { Router } from "express";
import { createWalletChallenge, verifyWalletChallenge } from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/wallet/challenge", createWalletChallenge);
authRouter.post("/wallet/verify", verifyWalletChallenge);
