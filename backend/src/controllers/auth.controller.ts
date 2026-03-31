import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { AuthService } from "../services/auth.service.js";
import { walletChallengeSchema, walletVerifySchema } from "../validators/auth.js";

const authService = new AuthService();

export async function createWalletChallenge(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = walletChallengeSchema.parse(req.body);
  const result = await authService.createWalletChallenge({
    userId: actor.userId,
    walletAddress: payload.wallet_address,
    walletProvider: payload.wallet_provider,
  });

  res.status(201).json(result);
}

export async function verifyWalletChallenge(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = walletVerifySchema.parse(req.body);
  const result = await authService.verifyWalletChallenge({
    userId: actor.userId,
    challengeId: payload.challenge_id,
    walletAddress: payload.wallet_address,
    signature: payload.signature,
    signedMessage: payload.signed_message,
  });

  res.json({
    ...result,
    session_actor: {
      user_id: actor.userId,
      email: actor.email,
      phone: actor.phone,
    },
  });
}
