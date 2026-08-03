import type { RedisStore } from "../db/redis.js";
import { generateUniqueRoomCode } from "../utils/roomCode.js";
import { mirrorRoomToMongo } from "../db/mongo.js";
import { randomUUID } from "node:crypto";

export interface RoomMeta {
  roomId: string;
  code: string;
  status: "creating" | "waiting" | "active" | "completed" | "expired" | "destroyed";
  createdAt: string; // ISO string
  expiresAt: string; // ISO string
  firstClaimedAt: string | null;
  gridSize: number;
  pieceCount: number;
  playerCount: number;
  placedPieceCount: number;
  completed: boolean;
  completedAt: string | null;
  solveTime: number | null;
  creatorSessionId: string;
  idleTimerStartedAt: string | null;
  assetId: string;
}

export interface ImageAssetData {
  assetId: string;
  roomId: string;
  originalUrl: string;
  maskMetadataUrl: string;
  generatedAt: string;
  expiresAt: string;
  sourceHash: string;
  imageWidth: number;
  imageHeight: number;
}

export async function createRoomRecord(
  redis: RedisStore,
  params: {
    gridSize: number;
    uploadId: string;
    roomId?: string;
    imageAsset?: ImageAssetData;
  }
): Promise<{ roomMeta: RoomMeta; imageAsset: ImageAssetData }> {
  const { gridSize, uploadId } = params;
  const roomId = params.roomId || `room_${randomUUID()}`;
  const code = await generateUniqueRoomCode(redis, roomId);

  const nowMs = Date.now();
  const expiresMs = nowMs + 24 * 60 * 60 * 1000;

  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(expiresMs).toISOString();

  const pieceCount = gridSize * gridSize;

  const imageAsset: ImageAssetData = params.imageAsset || {
    assetId: `asset_${randomUUID()}`,
    roomId,
    originalUrl: `https://placeholder.squadpuzzle.com/assets/${uploadId}_base.jpg`,
    maskMetadataUrl: `https://placeholder.squadpuzzle.com/assets/${uploadId}_masks.json`,
    generatedAt: nowIso,
    expiresAt: expiresIso,
    sourceHash: `hash_${uploadId}`,
    imageWidth: 1000,
    imageHeight: 1000
  };

  const roomMeta: RoomMeta = {
    roomId,
    code,
    status: "active",
    createdAt: nowIso,
    expiresAt: expiresIso,
    firstClaimedAt: null,
    gridSize,
    pieceCount,
    playerCount: 1,
    placedPieceCount: 0,
    completed: false,
    completedAt: null,
    solveTime: null,
    creatorSessionId: "", // Will be updated once creator session is issued
    idleTimerStartedAt: null,
    assetId: imageAsset.assetId
  };

  const redisKey = `room:${roomId}:meta`;
  await redis.hset(redisKey, {
    roomId: roomMeta.roomId,
    code: roomMeta.code,
    status: roomMeta.status,
    createdAt: String(nowMs),
    expiresAt: String(expiresMs),
    firstClaimedAt: "",
    gridSize: String(roomMeta.gridSize),
    pieceCount: String(roomMeta.pieceCount),
    playerCount: "1",
    placedPieceCount: "0",
    completed: "false",
    completedAt: "",
    solveTime: "",
    creatorSessionId: "",
    idleTimerStartedAt: "",
    assetId: roomMeta.assetId
  });
  await redis.expire(redisKey, 86400);

  // Store static piece attributes
  await redis.hset(`room:${roomId}:pieces_static`, { initialized: "true" });
  await redis.expire(`room:${roomId}:pieces_static`, 86400);

  // Store asset data in Redis
  await redis.hset(`asset:${roomId}:${imageAsset.assetId}`, {
    assetId: imageAsset.assetId,
    roomId: imageAsset.roomId,
    originalUrl: imageAsset.originalUrl,
    maskMetadataUrl: imageAsset.maskMetadataUrl,
    generatedAt: String(nowMs),
    expiresAt: String(expiresMs),
    sourceHash: imageAsset.sourceHash,
    imageWidth: String(imageAsset.imageWidth),
    imageHeight: String(imageAsset.imageHeight)
  });
  await redis.expire(`asset:${roomId}:${imageAsset.assetId}`, 86400);

  // Mirror to Mongo
  mirrorRoomToMongo({
    _id: roomId,
    roomId,
    code,
    status: "active",
    createdAt: nowMs,
    expiresAt: expiresMs,
    gridSize,
    pieceCount,
    assetId: imageAsset.assetId
  });

  return { roomMeta, imageAsset };
}

export async function updateRoomCreatorSession(
  redis: RedisStore,
  roomId: string,
  sessionId: string
): Promise<void> {
  const redisKey = `room:${roomId}:meta`;
  await redis.hset(redisKey, { creatorSessionId: sessionId });
}

export async function getRoomByCode(
  redis: RedisStore,
  code: string
): Promise<RoomMeta | null> {
  const normalized = code.trim().toUpperCase();
  const roomId = await redis.get(`roomcode:${normalized}`);
  if (!roomId) return null;

  return await getRoomById(redis, roomId);
}

export async function getRoomById(
  redis: RedisStore,
  roomId: string
): Promise<RoomMeta | null> {
  const redisKey = `room:${roomId}:meta`;
  const data = await redis.hgetall<Record<string, string>>(redisKey);
  if (!data || !data.roomId || !data.code) return null;

  const createdAtMs = parseInt(data.createdAt || "0", 10);
  const expiresAtMs = parseInt(data.expiresAt || "0", 10);
  const firstClaimedAtMs = data.firstClaimedAt ? parseInt(data.firstClaimedAt, 10) : null;
  const completedAtMs = data.completedAt ? parseInt(data.completedAt, 10) : null;
  const idleTimerStartedAtMs = data.idleTimerStartedAt ? parseInt(data.idleTimerStartedAt, 10) : null;

  return {
    roomId: data.roomId,
    code: data.code,
    status: data.status as RoomMeta["status"],
    createdAt: createdAtMs ? new Date(createdAtMs).toISOString() : new Date().toISOString(),
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : new Date().toISOString(),
    firstClaimedAt: firstClaimedAtMs ? new Date(firstClaimedAtMs).toISOString() : null,
    gridSize: parseInt(data.gridSize || "8", 10),
    pieceCount: parseInt(data.pieceCount || "64", 10),
    playerCount: parseInt(data.playerCount || "0", 10),
    placedPieceCount: parseInt(data.placedPieceCount || "0", 10),
    completed: data.completed === "true",
    completedAt: completedAtMs ? new Date(completedAtMs).toISOString() : null,
    solveTime: data.solveTime ? parseInt(data.solveTime, 10) : null,
    creatorSessionId: data.creatorSessionId || "",
    idleTimerStartedAt: idleTimerStartedAtMs ? new Date(idleTimerStartedAtMs).toISOString() : null,
    assetId: data.assetId || ""
  };
}

export async function getActiveSessionsInRoom(
  redis: RedisStore,
  roomId: string
): Promise<string[]> {
  return await redis.smembers(`room:${roomId}:sessions`);
}
