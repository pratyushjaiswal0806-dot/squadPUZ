import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../db/redis.js";
import { mirrorIdempotencyToMongo } from "../db/mongo.js";
import { AppError } from "../errors.js";

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawKey = req.headers["idempotency-key"] || req.headers["Idempotency-Key"];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key || typeof key !== "string" || !key.trim()) {
      throw new AppError("MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required for this operation", {
        statusCode: 400
      });
    }

    const trimmedKey = key.trim();
    const redis = getRedisClient();
    const redisKey = `idempotency:${trimmedKey}`;

    // Compute request hash based on JSON payload
    const requestHash = createHash("sha256")
      .update(JSON.stringify(req.body || {}))
      .digest("hex");

    const cachedData = await redis.get(redisKey);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData) as {
          requestHash: string;
          statusCode: number;
          responseBody: unknown;
        };

        if (parsed.requestHash === requestHash) {
          // Same request hash: return cached response
          res.status(parsed.statusCode).json(parsed.responseBody);
          return;
        } else {
          // Key reused with different body: return 409 Conflict
          throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key reused with different request payload", {
            statusCode: 409
          });
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        console.error("[Idempotency] Failed to parse cached idempotency entry:", err);
      }
    }

    // Intercept response to cache on success/completion
    const originalJson = res.json.bind(res);

    res.json = (body: unknown): Response => {
      // Only cache 2xx status responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cacheEntry = {
          requestHash,
          statusCode: res.statusCode,
          responseBody: body
        };

        redis
          .set(redisKey, JSON.stringify(cacheEntry), { ex: IDEMPOTENCY_TTL_SECONDS })
          .catch((err) => console.error("[Idempotency] Redis cache write error:", err));

        mirrorIdempotencyToMongo(trimmedKey, cacheEntry).catch((err) =>
          console.error("[Idempotency] Mongo mirror write error:", err)
        );
      }

      return originalJson(body);
    };

    next();
  } catch (err) {
    next(err);
  }
}
