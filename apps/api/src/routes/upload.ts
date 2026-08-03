import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { AppError } from "../errors.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { getRedisClient } from "../db/redis.js";
import { getStorageService } from "../services/s3Client.js";
import { validateImageBuffer } from "../services/imageUtils.js";

const uploadRouter = Router();

// Configure multer for in-memory file buffering with 10MB hard limit
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

uploadRouter.post(
  "/upload",
  createRateLimiter("upload", 5),
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("image")(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return next(
              new AppError("INVALID_UPLOAD", "Image file size exceeds maximum limit of 10MB", {
                statusCode: 400
              })
            );
          }
        }
        return next(
          new AppError("INVALID_UPLOAD", "Failed to parse multipart form data upload", {
            statusCode: 400
          })
        );
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contentType = req.headers["content-type"] || "";
      if (!contentType.includes("multipart/form-data")) {
        throw new AppError("INVALID_UPLOAD", "Upload request must be multipart/form-data", {
          statusCode: 400
        });
      }

      const file = req.file;
      if (!file || !file.buffer || file.buffer.length === 0) {
        throw new AppError("INVALID_UPLOAD", "Field 'image' is required and must contain image file bytes", {
          statusCode: 400
        });
      }

      // Format detection & aspect ratio validation via sharp
      let meta;
      try {
        meta = await validateImageBuffer(file.buffer);
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === "INVALID_ASPECT_RATIO") {
            throw new AppError("INVALID_ASPECT_RATIO", "Image aspect ratio must be between 0.5 and 2.0", {
              statusCode: 400
            });
          }
          if (err.message === "INVALID_FORMAT") {
            throw new AppError("INVALID_UPLOAD", "Unsupported or invalid image format. Allowed: jpeg, png, webp, gif", {
              statusCode: 400
            });
          }
        }
        throw new AppError("INVALID_UPLOAD", "Image file is corrupted, malformed, or unreadable", {
          statusCode: 400
        });
      }

      const uploadId = `upl_${crypto.randomUUID()}`;
      const stagedKey = `staged/${uploadId}.bin`;
      const expiresAtMs = Date.now() + 10 * 60 * 1000; // 10 minutes TTL
      const expiresAt = new Date(expiresAtMs).toISOString();

      // Stage raw upload bytes in S3/R2 storage
      const storage = getStorageService();
      await storage.uploadBuffer(stagedKey, file.buffer, `image/${meta.format}`, {
        uploadId,
        expiresAt
      });

      // Save upload metadata in Redis with TTL 600 seconds
      const redis = getRedisClient();
      const uploadRecord = {
        uploadId,
        format: meta.format,
        width: meta.width,
        height: meta.height,
        aspectRatio: meta.aspectRatio,
        stagedKey,
        expiresAt,
        createdAt: new Date().toISOString()
      };

      await redis.set(`upload:${uploadId}`, JSON.stringify(uploadRecord), { ex: 600 });

      res.status(200).json({
        uploadId,
        image: {
          format: meta.format,
          width: meta.width,
          height: meta.height,
          aspectRatio: meta.aspectRatio
        },
        expiresAt
      });
    } catch (err) {
      next(err);
    }
  }
);

export default uploadRouter;
