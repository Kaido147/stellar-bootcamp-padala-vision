import cors from "cors";
import express from "express";
import { repository } from "./lib/repository.js";
import { OracleService } from "./services/oracle.service.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();
  const oracleService = new OracleService();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, repository: repository.mode, oracle: oracleService.getProviderMode() });
  });

  app.use("/api", apiRouter);
  app.use(errorHandler);

  return app;
}
