import express from "express";
import { AppError, errorMiddleware } from "./errors.js";
import { warnMissingEnvVars } from "./env.js";
import uploadRouter from "./routes/upload.js";
import roomsRouter from "./routes/rooms.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  // Basic CORS middleware
  app.use((req, res, next) => {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    warnMissingEnvVars("api-health");

    response.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  // Mount API routers
  app.use(uploadRouter);
  app.use(roomsRouter);

  // Mount under /api prefix as well for flex compatibility
  app.use("/api", uploadRouter);
  app.use("/api", roomsRouter);

  app.use((_request, _response, next) => {
    next(new AppError("NOT_FOUND", "Route not found", { statusCode: 404 }));
  });

  app.use(errorMiddleware);

  return app;
}