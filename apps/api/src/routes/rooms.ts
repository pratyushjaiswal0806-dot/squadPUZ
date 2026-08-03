import { Router } from "express";
import { getRedisClient } from "../db/redis.js";
import { createRoomRecord, updateRoomCreatorSession, getRoomByCode, getRoomById } from "../services/roomService.js";
import { createSession, type SessionData } from "../services/sessionService.js";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { sanitizeDisplayName } from "../utils/sanitizer.js";
import { normalizeRoomCode } from "../utils/roomCode.js";
import { AppError } from "../errors.js";

const roomsRouter = Router();

// Helper to safely get route param string
function getParamString(paramValue: string | string[] | undefined): string {
  if (!paramValue) return "";
  const val = Array.isArray(paramValue) ? paramValue[0] : paramValue;
  return val || "";
}

// POST /rooms - Create room
roomsRouter.post(
  "/rooms",
  createRateLimiter("create_room", 3),
  idempotencyMiddleware,
  async (req, res, next) => {
    try {
      const { uploadId, gridSize, displayName } = req.body || {};

      // 1. Validate uploadId
      if (typeof uploadId !== "string" || !uploadId.trim()) {
        throw new AppError("INVALID_UPLOAD", "uploadId is required", { statusCode: 400 });
      }

      // Bypass check for Phase 1 testing
      if (!uploadId.startsWith("test_")) {
        throw new AppError("INVALID_UPLOAD", "Invalid or expired uploadId", { statusCode: 400 });
      }

      // 2. Validate gridSize
      const parsedGridSize = typeof gridSize === "number" ? gridSize : parseInt(String(gridSize), 10);
      if (isNaN(parsedGridSize) || !Number.isInteger(parsedGridSize) || parsedGridSize < 4 || parsedGridSize > 10) {
        throw new AppError("INVALID_GRID_SIZE", "gridSize must be an integer between 4 and 10", {
          statusCode: 400
        });
      }

      // 3. Validate displayName
      const sanitizeResult = sanitizeDisplayName(displayName);
      if (!sanitizeResult.valid) {
        throw new AppError("INVALID_DISPLAY_NAME", sanitizeResult.error || "Invalid display name", {
          statusCode: 400
        });
      }

      const redis = getRedisClient();

      // 4. Create Room entity & synthesized asset
      const { roomMeta } = await createRoomRecord(redis, {
        gridSize: parsedGridSize,
        uploadId
      });

      // 5. Issue Creator's Session
      const { session, token } = await createSession(redis, roomMeta.roomId, sanitizeResult.sanitized);

      // 6. Update creatorSessionId in room meta
      await updateRoomCreatorSession(redis, roomMeta.roomId, session.sessionId);

      const webSocketUrl = process.env.REALTIME_WS_URL || "wss://localhost:8080/realtime";

      res.status(201).json({
        room: {
          roomId: roomMeta.roomId,
          code: roomMeta.code,
          status: roomMeta.status,
          createdAt: roomMeta.createdAt,
          expiresAt: roomMeta.expiresAt,
          gridSize: roomMeta.gridSize,
          pieceCount: roomMeta.pieceCount
        },
        session: {
          sessionId: session.sessionId,
          token: token,
          displayName: session.displayName
        },
        webSocketUrl
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /rooms/:code - Room metadata lookup
roomsRouter.get(
  "/rooms/:code",
  createRateLimiter("get_room", 30),
  async (req, res, next) => {
    try {
      const normalizedCode = normalizeRoomCode(getParamString(req.params.code));
      if (!normalizedCode) {
        throw new AppError("INVALID_CODE", "Invalid room code", { statusCode: 400 });
      }

      const redis = getRedisClient();
      const roomMeta = await getRoomByCode(redis, normalizedCode);

      if (!roomMeta || roomMeta.status === "destroyed") {
        throw new AppError("ROOM_NOT_FOUND", "Room not found", { statusCode: 404 });
      }

      const now = Date.now();
      const expiresAtMs = new Date(roomMeta.expiresAt).getTime();
      if (roomMeta.status === "expired" || now >= expiresAtMs) {
        throw new AppError("ROOM_EXPIRED", "Room has expired", { statusCode: 410 });
      }

      res.json({
        room: {
          roomId: roomMeta.roomId,
          code: roomMeta.code,
          status: roomMeta.status,
          expiresAt: roomMeta.expiresAt,
          gridSize: roomMeta.gridSize,
          pieceCount: roomMeta.pieceCount,
          playerCount: roomMeta.playerCount,
          capacity: 6,
          completed: roomMeta.completed
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /rooms/:code/join - Join active room
roomsRouter.post(
  "/rooms/:code/join",
  createRateLimiter("join_room", 10),
  async (req, res, next) => {
    try {
      const normalizedCode = normalizeRoomCode(getParamString(req.params.code));
      if (!normalizedCode) {
        throw new AppError("INVALID_CODE", "Invalid room code", { statusCode: 400 });
      }

      const { displayName, reconnectSessionId } = req.body || {};
      const redis = getRedisClient();

      const roomId = await redis.get(`roomcode:${normalizedCode}`);
      if (!roomId) {
        throw new AppError("ROOM_NOT_FOUND", "Room not found", { statusCode: 404 });
      }

      const roomMeta = await getRoomById(redis, roomId);
      if (!roomMeta || roomMeta.status === "destroyed") {
        throw new AppError("ROOM_NOT_FOUND", "Room not found", { statusCode: 404 });
      }

      const now = Date.now();
      const expiresAtMs = new Date(roomMeta.expiresAt).getTime();
      if (roomMeta.status === "expired" || now >= expiresAtMs) {
        throw new AppError("ROOM_EXPIRED", "Room has expired", { statusCode: 410 });
      }

      // Reconnect logic if reconnectSessionId is provided
      if (typeof reconnectSessionId === "string" && reconnectSessionId.trim()) {
        const sessionKey = `session:${roomId}:${reconnectSessionId.trim()}`;
        const sessionHash = await redis.hgetall<Record<string, string>>(sessionKey);

        if (sessionHash && sessionHash.sessionId && sessionHash.roomId && sessionHash.displayName) {
          // Reactivate session
          const nowIso = new Date().toISOString();
          await redis.hset(sessionKey, {
            connectionState: "connected",
            lastSeenAt: String(now),
            gracePeriodExpiry: ""
          });

          // Fetch token from session hash
          const token = sessionHash.token || "";

          const sessionData: SessionData = {
            sessionId: sessionHash.sessionId,
            roomId: sessionHash.roomId,
            displayName: sessionHash.displayName,
            displayDisambiguator: sessionHash.displayDisambiguator || null,
            connectedAt: sessionHash.connectedAt ? new Date(parseInt(sessionHash.connectedAt, 10)).toISOString() : nowIso,
            lastSeenAt: nowIso,
            gracePeriodExpiry: null,
            connectionState: "connected",
            connectionId: null
          };

          const webSocketUrl = process.env.REALTIME_WS_URL || "wss://localhost:8080/realtime";

          return res.json({
            session: {
              sessionId: sessionData.sessionId,
              token,
              displayName: sessionData.displayName,
              displayDisambiguator: sessionData.displayDisambiguator
            },
            roomStateSnapshot: {
              room: {
                roomId: roomMeta.roomId,
                code: roomMeta.code,
                status: roomMeta.status,
                gridSize: roomMeta.gridSize,
                pieceCount: roomMeta.pieceCount,
                placedPieceCount: roomMeta.placedPieceCount,
                completed: roomMeta.completed
              },
              players: [
                {
                  sessionId: sessionData.sessionId,
                  displayName: sessionData.displayName,
                  displayDisambiguator: sessionData.displayDisambiguator,
                  connectionState: "connected"
                }
              ],
              pieces: [],
              locks: [],
              assets: {
                baseImageUrl: `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_base.jpg`,
                maskMetadataUrl: `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_masks.json`
              }
            },
            webSocketUrl
          });
        }
      }

      // New player join flow: Validate displayName
      const sanitizeResult = sanitizeDisplayName(displayName);
      if (!sanitizeResult.valid) {
        throw new AppError("INVALID_DISPLAY_NAME", sanitizeResult.error || "Invalid display name", {
          statusCode: 400
        });
      }

      // Capacity validation: Max 6 active connected sessions
      const sessionIds = await redis.smembers(`room:${roomId}:sessions`);
      let activeCount = 0;
      const graceSessions: { sessionId: string; connectedAt: number }[] = [];

      for (const sId of sessionIds) {
        const sHash = await redis.hgetall<Record<string, string>>(`session:${roomId}:${sId}`);
        if (sHash) {
          if (sHash.connectionState === "connected") {
            activeCount++;
          } else if (sHash.connectionState === "grace") {
            graceSessions.push({
              sessionId: sId,
              connectedAt: parseInt(sHash.connectedAt || "0", 10)
            });
          }
        }
      }

      if (activeCount >= 6) {
        if (graceSessions.length > 0) {
          // Evict oldest grace session
          graceSessions.sort((a, b) => a.connectedAt - b.connectedAt);
          const oldestGrace = graceSessions[0];
          if (oldestGrace) {
            await redis.hset(`session:${roomId}:${oldestGrace.sessionId}`, {
              connectionState: "left"
            });
          }
        } else {
          throw new AppError("ROOM_FULL", "Room has reached maximum player capacity (6 players)", {
            statusCode: 409
          });
        }
      }

      // Create new player session
      const { session, token } = await createSession(redis, roomId, sanitizeResult.sanitized);

      // Increment playerCount in Redis meta
      const updatedPlayerCount = activeCount + 1;
      await redis.hset(`room:${roomId}:meta`, { playerCount: String(updatedPlayerCount) });

      const webSocketUrl = process.env.REALTIME_WS_URL || "wss://localhost:8080/realtime";

      res.json({
        session: {
          sessionId: session.sessionId,
          token,
          displayName: session.displayName,
          displayDisambiguator: session.displayDisambiguator
        },
        roomStateSnapshot: {
          room: {
            roomId: roomMeta.roomId,
            code: roomMeta.code,
            status: roomMeta.status,
            gridSize: roomMeta.gridSize,
            pieceCount: roomMeta.pieceCount,
            placedPieceCount: roomMeta.placedPieceCount,
            completed: roomMeta.completed
          },
          players: [
            {
              sessionId: session.sessionId,
              displayName: session.displayName,
              displayDisambiguator: session.displayDisambiguator,
              connectionState: "connected"
            }
          ],
          pieces: [],
          locks: [],
          assets: {
            baseImageUrl: `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_base.jpg`,
            maskMetadataUrl: `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_masks.json`
          }
        },
        webSocketUrl
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /rooms/:code/assets - Refresh asset URLs for session
roomsRouter.get(
  "/rooms/:code/assets",
  authMiddleware,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const normalizedCode = normalizeRoomCode(getParamString(req.params.code));
      const redis = getRedisClient();
      const roomId = await redis.get(`roomcode:${normalizedCode}`);

      if (!roomId || roomId !== req.roomId) {
        throw new AppError("ROOM_NOT_FOUND", "Room not found or unauthorized", { statusCode: 404 });
      }

      const roomMeta = await getRoomById(redis, roomId);
      if (!roomMeta || roomMeta.status === "destroyed" || roomMeta.status === "expired") {
        throw new AppError("ROOM_EXPIRED", "Room has expired or does not exist", { statusCode: 410 });
      }

      const expiresAtIso = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

      res.json({
        assets: {
          baseImageUrl: `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_base.jpg?signature=stub_hmac_${Date.now()}`,
          maskMetadataUrl: `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_masks.json?signature=stub_hmac_${Date.now()}`,
          expiresAt: expiresAtIso
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

export default roomsRouter;
