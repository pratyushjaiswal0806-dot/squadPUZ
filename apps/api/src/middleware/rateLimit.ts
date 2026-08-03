import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../db/redis.js";
import { AppError } from "../errors.js";

export function createRateLimiter(endpointName: string, maxRequests: number, windowSeconds = 60) {
  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (process.env.NODE_ENV === "test") {
        next();
        return;
      }

      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        "127.0.0.1";
      const userAgent = (req.headers["user-agent"] as string) || "";

      const clientHash = createHash("sha256").update(`${ip}:${userAgent}`).digest("hex");
      const redisKey = `ratelimit:${endpointName}:${clientHash}`;

      const redis = getRedisClient();
      const currentCount = await redis.hincrby(redisKey, "count", 1);

      if (currentCount === 1) {
        await redis.expire(redisKey, windowSeconds);
      }

      if (currentCount > maxRequests) {
        res.setHeader("Retry-After", String(windowSeconds));
        throw new AppError("RATE_LIMITED", "Rate limit exceeded. Please try again later.", {
          statusCode: 429,
          retryable: true,
          context: { retryAfter: windowSeconds }
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
