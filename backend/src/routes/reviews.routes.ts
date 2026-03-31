import { Router } from "express";
import { getReview, listReviews } from "../controllers/reviews.controller.js";
import { requireRole } from "../middleware/require-role.js";

export const reviewsRouter = Router();

reviewsRouter.get("/", requireRole("ops_reviewer", "ops_admin"), listReviews);
reviewsRouter.get("/:orderId", requireRole("ops_reviewer", "ops_admin"), getReview);
