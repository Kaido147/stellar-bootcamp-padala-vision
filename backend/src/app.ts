import cors from "cors";
import express from "express";
import { repository } from "./lib/repository.js";
import { workflowRouter } from "./routes/workflow.routes.js";
import { correlationIdMiddleware } from "./middleware/correlation-id.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
import { authSessionMiddleware } from "./middleware/auth.js";
import { OracleService } from "./services/oracle.service.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { runtimeCapabilities } from "./config/env.js";

export function createApp() {
  const app = express();
  const oracleService = new OracleService();

  app.use(correlationIdMiddleware);
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", workflowRouter);
  app.use("/api", idempotencyMiddleware);
  app.use("/api", authSessionMiddleware);

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      repository: repository.mode,
      oracle: oracleService.getProviderMode(),
      geminiProofAnalysisEnabled: runtimeCapabilities.geminiProofAnalysisEnabled,
    });
  });

  app.use("/api", apiRouter);
  app.use(errorHandler);

  return app;
}
