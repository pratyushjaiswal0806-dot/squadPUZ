import express from "express";
import { AppError, errorMiddleware } from "./errors.js";
import { warnMissingEnvVars } from "./env.js";
import { globalWorkerQueue } from "./services/workerQueue.js";
import { processUploadWorker } from "./services/uploadProcessor.js";

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

  // Internal endpoint for puzzle asset processing
  app.post("/internal/process-upload", async (req, res, next) => {
    try {
      const secretHeader = req.headers["x-internal-secret"] || req.headers["authorization"];
      const expectedSecret =
        process.env.INTERNAL_SHARED_SECRET ||
        process.env.INTERNAL_API_SECRET ||
        "3fb2619708bde3f4273f195c02206493dc75b82e9faa6e1041feae32a709e01b";

      if (
        typeof secretHeader !== "string" ||
        (secretHeader !== expectedSecret && secretHeader !== `Bearer ${expectedSecret}`)
      ) {
        throw new AppError("UNAUTHORIZED", "Invalid internal secret header", { statusCode: 401 });
      }

      const { uploadId, roomId, gridSize } = req.body || {};

      if (typeof uploadId !== "string" || !uploadId.trim()) {
        throw new AppError("INVALID_UPLOAD", "uploadId is required", { statusCode: 400 });
      }
      if (typeof roomId !== "string" || !roomId.trim()) {
        throw new AppError("INVALID_ROOM", "roomId is required", { statusCode: 400 });
      }

      const parsedGridSize = typeof gridSize === "number" ? gridSize : parseInt(String(gridSize), 10);
      if (isNaN(parsedGridSize) || !Number.isInteger(parsedGridSize) || parsedGridSize < 4 || parsedGridSize > 10) {
        throw new AppError("INVALID_GRID_SIZE", "gridSize must be an integer between 4 and 10", { statusCode: 400 });
      }

      const result = await globalWorkerQueue.run(
        () => processUploadWorker({ uploadId, roomId, gridSize: parsedGridSize }),
        5000
      );

      res.json({
        success: true,
        imageAsset: result.imageAsset,
        pieceCount: result.pieces.length,
        pieces: result.pieces
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((_request, _response, next) => {
    next(new AppError("NOT_FOUND", "Route not found", { statusCode: 404 }));
  });

  app.use(errorMiddleware);

  return app;
}