import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { ReviewsService } from "../services/reviews.service.js";

const reviewsService = new ReviewsService();

function getOrderIdParam(req: Request) {
  const orderId = req.params.orderId;
  return Array.isArray(orderId) ? orderId[0] : orderId;
}

export async function listReviews(req: Request, res: Response) {
  const actor = getSessionActor(res);
  res.json(await reviewsService.listReviews({ actor }));
}

export async function getReview(req: Request, res: Response) {
  const actor = getSessionActor(res);
  res.json(await reviewsService.getReview(getOrderIdParam(req), actor));
}
