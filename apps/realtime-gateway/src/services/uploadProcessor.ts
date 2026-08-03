import crypto from "node:crypto";
import { getRedisClient } from "../db/redis.js";
import { mirrorImageAssetToMongo, mirrorPiecesToMongo } from "../db/mongo.js";
import { getStorageService } from "./s3Client.js";
import { normalizeImageBuffer } from "./imageUtils.js";
import { generatePieceMasks, generatePiecesWithScatter, type PieceData } from "./puzzleGenerator.js";
import { HttpContentSafetyScanner, type ContentSafetyScanner } from "./safetyScanner.js";
import { AppError } from "../errors.js";
import type { ImageAsset } from "@squadpuzzle/shared-types";

export interface ProcessUploadOptions {
  uploadId: string;
  roomId: string;
  gridSize: number;
  safetyScanner?: ContentSafetyScanner;
}

export interface ProcessUploadResult {
  imageAsset: ImageAsset;
  pieces: PieceData[];
}

export async function processUploadWorker(options: ProcessUploadOptions): Promise<ProcessUploadResult> {
  const { uploadId, roomId, gridSize } = options;
  const scanner = options.safetyScanner || new HttpContentSafetyScanner();
  const redis = getRedisClient();
  const storage = getStorageService();

  // 1. Fetch staged upload metadata from Redis
  const uploadKey = `upload:${uploadId}`;
  const uploadMetaRaw = await redis.get(uploadKey);
  if (!uploadMetaRaw) {
    throw new AppError("UPLOAD_EXPIRED", "Upload ID has expired or does not exist", {
      statusCode: 400,
      retryable: false
    });
  }

  let uploadMeta: { stagedKey?: string; format?: string; expiresAt?: string };
  try {
    uploadMeta = JSON.parse(uploadMetaRaw);
  } catch {
    throw new AppError("INVALID_UPLOAD", "Invalid upload metadata record", { statusCode: 400 });
  }

  const stagedKey = uploadMeta.stagedKey || `staged/${uploadId}.bin`;

  // 2. Fetch raw staged bytes from S3
  let rawBuffer: Buffer;
  try {
    rawBuffer = await storage.getBuffer(stagedKey);
  } catch (err) {
    console.error(`[UploadProcessor] Failed to read staged object ${stagedKey}:`, err);
    throw new AppError("UPLOAD_EXPIRED", "Staged upload file not found in storage", { statusCode: 400 });
  }

  const basePrefix = `rooms/${roomId}`;
  const baseImageKey = `${basePrefix}/base.webp`;
  const masksKey = `${basePrefix}/masks.json`;

  try {
    // 3. Safety scan check
    const scanResult = await scanner.scanImage(rawBuffer, `image/${uploadMeta.format || "jpeg"}`);
    if (!scanResult.isSafe) {
      throw new AppError("INVALID_UPLOAD", scanResult.reason || "Image failed safety moderation check", {
        statusCode: 400,
        context: { categories: scanResult.flaggedCategories }
      });
    }

    // 4. Image normalization
    let normalized;
    try {
      normalized = await normalizeImageBuffer(rawBuffer);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "SHORTEST_SIDE_TOO_SMALL") {
          throw new AppError("INVALID_UPLOAD", "Image shortest side must be at least 800px", { statusCode: 400 });
        }
        if (err.message === "INVALID_ASPECT_RATIO") {
          throw new AppError("INVALID_ASPECT_RATIO", "Image aspect ratio must be between 0.5 and 2.0", { statusCode: 400 });
        }
      }
      throw new AppError("INVALID_UPLOAD", "Image data is corrupted or malformed", { statusCode: 400 });
    }

    // 5. Piece mask generation & scatter
    const masks = generatePieceMasks(normalized.sourceHash, gridSize, "v1");
    const pieces = generatePiecesWithScatter(roomId, normalized.sourceHash, gridSize, masks);

    // 6. Upload base image & mask metadata JSON to S3
    const roomExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const originalUrl = await storage.uploadBuffer(baseImageKey, normalized.buffer, "image/webp", {
      roomId,
      expiresAt: roomExpiresAt
    });

    const maskJsonBuffer = Buffer.from(
      JSON.stringify({
        roomId,
        gridSize,
        pieceCount: pieces.length,
        imageWidth: normalized.width,
        imageHeight: normalized.height,
        pieces: masks
      }),
      "utf8"
    );

    const maskMetadataUrl = await storage.uploadBuffer(masksKey, maskJsonBuffer, "application/json", {
      roomId,
      expiresAt: roomExpiresAt
    });

    // Clean up staged upload
    await storage.deleteObject(stagedKey).catch((e) => console.warn("[UploadProcessor] Failed deleting staged key:", e));
    await redis.del(uploadKey).catch(() => {});

    // 7. Write ImageAsset record to Redis & Mongo
    const assetId = `ast_${crypto.randomUUID()}`;
    const imageAsset: ImageAsset = {
      assetId,
      roomId,
      originalUrl,
      maskMetadataUrl,
      generatedAt: new Date().toISOString(),
      expiresAt: roomExpiresAt,
      sourceHash: normalized.sourceHash,
      imageWidth: normalized.width,
      imageHeight: normalized.height
    };

    const redisAssetKey = `room:${roomId}:asset`;
    await redis.set(redisAssetKey, JSON.stringify(imageAsset), { ex: 86400 });
    await mirrorImageAssetToMongo(imageAsset as unknown as Record<string, unknown>);

    // 8. Write Piece records to Redis & Mongo
    const piecesKey = `room:${roomId}:pieces`;
    const pieceIds = pieces.map((p) => p.pieceId);
    if (pieceIds.length > 0) {
      await redis.sadd(piecesKey, ...pieceIds);
      await redis.expire(piecesKey, 86400);
    }

    for (const piece of pieces) {
      const pieceKey = `room:${roomId}:piece:${piece.pieceId}`;
      await redis.hset(pieceKey, {
        pieceId: piece.pieceId,
        roomId: piece.roomId,
        gridX: String(piece.gridX),
        gridY: String(piece.gridY),
        isEdgePiece: String(piece.isEdgePiece),
        correctPositionX: String(piece.correctPositionX),
        correctPositionY: String(piece.correctPositionY),
        currentPositionX: String(piece.currentPositionX),
        currentPositionY: String(piece.currentPositionY),
        zIndex: String(piece.zIndex),
        placedAt: piece.placedAt || "",
        placedBy: piece.placedBy || "",
        bounds: JSON.stringify(piece.bounds)
      });
      await redis.expire(pieceKey, 86400);
    }

    await mirrorPiecesToMongo(roomId, pieces as unknown as Record<string, unknown>[]);

    return {
      imageAsset,
      pieces
    };
  } catch (err) {
    // Partial S3 asset cleanup on failure
    await storage.deletePrefix(basePrefix).catch(() => {});
    throw err;
  }
}
