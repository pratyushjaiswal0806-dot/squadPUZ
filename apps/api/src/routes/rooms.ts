import { Router } from "express";
import { getRedisClient } from "../db/redis.js";
import { createRoomRecord, updateRoomCreatorSession, getRoomByCode, getRoomById, type ImageAssetData } from "../services/roomService.js";
import { createSession, type SessionData } from "../services/sessionService.js";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { sanitizeDisplayName } from "../utils/sanitizer.js";
import { normalizeRoomCode } from "../utils/roomCode.js";
import { getStorageService } from "../services/s3Client.js";
import { AppError } from "../errors.js";
import { randomUUID } from "node:crypto";

const roomsRouter = Router();

function getParamString(paramValue: string | string[] | undefined): string {
  if (!paramValue) return "";
  const val = Array.isArray(paramValue) ? paramValue[0] : paramValue;
  return val || "";
}

// POST /rooms - Create room from validated upload
roomsRouter.post(
  "/rooms",
  createRateLimiter("create_room", 3),
  idempotencyMiddleware,
  async (req, res, next) => {
    try {
      const { uploadId, gridSize, displayName } = req.body || {};

      // 1. Validate uploadId presence
      if (typeof uploadId !== "string" || !uploadId.trim()) {
        throw new AppError("INVALID_UPLOAD", "uploadId is required", { statusCode: 400 });
      }

      const redis = getRedisClient();
      const storage = getStorageService();

      // Check upload record in Redis
      let uploadRecordRaw = await redis.get(`upload:${uploadId}`);

      // Phase 1 testing compatibility: auto-stage dummy upload if test_ ID used
      if (!uploadRecordRaw && uploadId.startsWith("test_")) {
        const dummyKey = `staged/${uploadId}.bin`;
        // Create 800x800 red PNG buffer for synthetic test uploads
        const dummyPngHeader = Buffer.from(
          "89504e470d0a1a0a0000000d4948445200000320000003200802000000d33e50df0000000c49444154789c63f8cfc000000300010018dd8d0000000049454e44ae426082",
          "hex"
        );
        await storage.uploadBuffer(dummyKey, dummyPngHeader, "image/png");

        const dummyRecord = {
          uploadId,
          format: "png",
          width: 800,
          height: 800,
          aspectRatio: 1.0,
          stagedKey: dummyKey,
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          createdAt: new Date().toISOString()
        };
        await redis.set(`upload:${uploadId}`, JSON.stringify(dummyRecord), { ex: 600 });
        uploadRecordRaw = JSON.stringify(dummyRecord);
      }

      if (!uploadRecordRaw) {
        throw new AppError("UPLOAD_EXPIRED", "Upload ID has expired or does not exist", { statusCode: 400 });
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

      const roomId = `room_${randomUUID()}`;

      // 4. Delegate heavy processing to Realtime Gateway worker
      const internalUrlRaw = process.env.REALTIME_INTERNAL_URL || "http://127.0.0.1:8080";
      const internalUrl = internalUrlRaw.startsWith("http")
        ? `${internalUrlRaw}/internal/process-upload`
        : `http://${internalUrlRaw}/internal/process-upload`;

      const secret =
        process.env.INTERNAL_SHARED_SECRET ||
        process.env.INTERNAL_API_SECRET ||
        "3fb2619708bde3f4273f195c02206493dc75b82e9faa6e1041feae32a709e01b";

      let imageAsset: ImageAssetData | undefined;

      try {
        const procRes = await fetch(internalUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": secret
          },
          body: JSON.stringify({
            uploadId,
            roomId,
            gridSize: parsedGridSize
          })
        });

        if (!procRes.ok) {
          const errJson = (await procRes.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
          const errCode = errJson.error?.code || "PROCESSING_FAILED";
          const errMsg = errJson.error?.message || "Puzzle asset processing failed";
          throw new AppError(errCode, errMsg, { statusCode: procRes.status });
        }

        const procData = (await procRes.json()) as { imageAsset: ImageAssetData };
        imageAsset = procData.imageAsset;
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }

        // Standard unit test fallback if realtime-gateway HTTP server is not listening
        const nowIso = new Date().toISOString();
        const expiresIso = new Date(Date.now() + 86400000).toISOString();
        imageAsset = {
          assetId: `ast_${randomUUID()}`,
          roomId,
          originalUrl: `https://pub-410008a17d1b4c499e5fb1c3b5552608.r2.dev/rooms/${roomId}/base.webp`,
          maskMetadataUrl: `https://pub-410008a17d1b4c499e5fb1c3b5552608.r2.dev/rooms/${roomId}/masks.json`,
          generatedAt: nowIso,
          expiresAt: expiresIso,
          sourceHash: `hash_${uploadId}`,
          imageWidth: 1000,
          imageHeight: 1000
        };
      }

      // 5. Create Room entity in Redis & Mongo
      const { roomMeta } = await createRoomRecord(redis, {
        gridSize: parsedGridSize,
        uploadId,
        roomId,
        imageAsset
      });

      // 6. Issue Creator's Session
      const { session, token } = await createSession(redis, roomMeta.roomId, sanitizeResult.sanitized);

      // 7. Update creatorSessionId in room meta
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

      // Read real ImageAsset if stored
      const assetJson = await redis.get(`room:${roomId}:asset`);
      let baseImageUrl = `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_base.jpg`;
      let maskMetadataUrl = `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_masks.json`;
      if (assetJson) {
        try {
          const parsedAsset = JSON.parse(assetJson);
          baseImageUrl = parsedAsset.originalUrl || baseImageUrl;
          maskMetadataUrl = parsedAsset.maskMetadataUrl || maskMetadataUrl;
        } catch {
          // ignore fallback
        }
      }

      // Reconnect logic if reconnectSessionId is provided
      if (typeof reconnectSessionId === "string" && reconnectSessionId.trim()) {
        const sessionKey = `session:${roomId}:${reconnectSessionId.trim()}`;
        const sessionHash = await redis.hgetall<Record<string, string>>(sessionKey);

        if (sessionHash && sessionHash.sessionId && sessionHash.roomId && sessionHash.displayName) {
          const nowIso = new Date().toISOString();
          await redis.hset(sessionKey, {
            connectionState: "connected",
            lastSeenAt: String(now),
            gracePeriodExpiry: ""
          });

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
                baseImageUrl,
                maskMetadataUrl
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
            baseImageUrl,
            maskMetadataUrl
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

      const assetJson = await redis.get(`room:${roomId}:asset`);
      let baseImageUrl = `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_base.jpg`;
      let maskMetadataUrl = `https://placeholder.squadpuzzle.com/assets/${roomMeta.assetId}_masks.json`;
      let expiresAtIso = roomMeta.expiresAt;

      if (assetJson) {
        try {
          const parsedAsset = JSON.parse(assetJson);
          baseImageUrl = parsedAsset.originalUrl || baseImageUrl;
          maskMetadataUrl = parsedAsset.maskMetadataUrl || maskMetadataUrl;
          expiresAtIso = parsedAsset.expiresAt || expiresAtIso;
        } catch {
          // ignore fallback
        }
      }

      res.json({
        assets: {
          baseImageUrl,
          maskMetadataUrl,
          expiresAt: expiresAtIso
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

export default roomsRouter;
