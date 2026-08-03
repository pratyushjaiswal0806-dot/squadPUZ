import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../db/redis.js";
import { getSessionByToken, type SessionData } from "../services/sessionService.js";
import { AppError } from "../errors.js";
import { normalizeRoomCode } from "../utils/roomCode.js";

export interface AuthenticatedRequest extends Request {
  session?: SessionData;
  token?: string;
  roomId?: string;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("UNAUTHORIZED", "Missing or malformed Authorization header", {
        statusCode: 401
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new AppError("UNAUTHORIZED", "Missing session token", {
        statusCode: 401
      });
    }

    const redis = getRedisClient();
    const result = await getSessionByToken(redis, token);
    if (!result) {
      throw new AppError("UNAUTHORIZED", "Invalid or expired session token", {
        statusCode: 401
      });
    }

    // If room code parameter exists in request route, ensure session belongs to target room
    const rawCode = req.params.code;
    const codeParam = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    const routeCode = codeParam ? normalizeRoomCode(codeParam) : null;

    if (routeCode) {
      const targetRoomId = await redis.get(`roomcode:${routeCode}`);
      if (!targetRoomId || targetRoomId !== result.roomId) {
        throw new AppError("UNAUTHORIZED", "Session does not belong to the target room", {
          statusCode: 401
        });
      }
    }

    req.session = result.session;
    req.token = token;
    req.roomId = result.roomId;

    next();
  } catch (err) {
    next(err);
  }
}
