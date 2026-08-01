import express from "express";
import { AppError, errorMiddleware } from "./errors.js";
import { warnMissingEnvVars } from "./env.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/health", (_request, response) => {
    warnMissingEnvVars("realtime-health");

    response.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  app.use((_request, _response, next) => {
    next(new AppError("not_found", "Route not found", { statusCode: 404 }));
  });

  app.use(errorMiddleware);

  return app;
}