import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { createApp as createApiApp } from "../app.js";
import { createApp as createRealtimeApp } from "../../../realtime-gateway/src/app.js";
import { getRedisClient } from "../db/redis.js";
import { getStorageService } from "../services/s3Client.js";
import { createTestFixtures, type TestImageFixtures } from "./fixtures/imageFixtures.js";

describe("Integration Tests: Full Upload Pipeline & End-to-End Validation", () => {
  let apiServer: http.Server;
  let realtimeServer: http.Server;
  let apiBaseUrl: string;
  let fixtures: TestImageFixtures;

  before(async () => {
    fixtures = await createTestFixtures();

    const apiApp = createApiApp();
    await new Promise<void>((resolve) => {
      apiServer = apiApp.listen(0, () => {
        const addr = apiServer.address();
        if (addr && typeof addr === "object") {
          apiBaseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });

    const realtimeApp = createRealtimeApp();
    await new Promise<void>((resolve) => {
      realtimeServer = realtimeApp.listen(0, () => {
        const addr = realtimeServer.address();
        if (addr && typeof addr === "object") {
          process.env.REALTIME_INTERNAL_URL = `127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (apiServer) {
      await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    }
    if (realtimeServer) {
      await new Promise<void>((resolve) => realtimeServer.close(() => resolve()));
    }
  });

  it("Executes end-to-end 8MB image upload and puzzle room creation in under 5 seconds", async () => {
    const startTime = performance.now();
    const redis = getRedisClient();
    const storage = getStorageService();

    // 1. POST /upload with 8MB image fixture
    const blob = new Blob([fixtures.large8mbBuffer], { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("image", blob, "large_8mb_photo.jpg");

    const uploadRes = await fetch(`${apiBaseUrl}/upload`, {
      method: "POST",
      body: formData
    });

    assert.equal(uploadRes.status, 200, "POST /upload must return status 200");
    const uploadData = (await uploadRes.json()) as {
      uploadId: string;
      image: { format: string; width: number; height: number; aspectRatio: number };
      expiresAt: string;
    };

    // Assertions for POST /upload
    assert.ok(uploadData.uploadId.startsWith("upl_"), "uploadId must start with upl_");
    assert.equal(uploadData.image.format, "jpeg");
    assert.equal(uploadData.image.width, 3200);
    assert.equal(uploadData.image.height, 2400);

    // Verify upload:<id> exists in Redis
    const redisKey = `upload:${uploadData.uploadId}`;
    const rawRedisMeta = await redis.get(redisKey);
    assert.ok(rawRedisMeta, "Upload key must exist in Redis");

    const redisMeta = JSON.parse(rawRedisMeta);
    assert.equal(redisMeta.uploadId, uploadData.uploadId);
    assert.equal(redisMeta.width, 3200);
    assert.equal(redisMeta.height, 2400);

    // Verify R2 object exists and is readable
    const stagedKey = redisMeta.stagedKey;
    const stagedBuf = await storage.getBuffer(stagedKey);
    assert.equal(stagedBuf.length, fixtures.large8mbBuffer.length, "Staged buffer size must match fixture size");

    // 2. POST /rooms with uploadId
    const roomPayload = {
      uploadId: uploadData.uploadId,
      gridSize: 6,
      displayName: "PipelineTester"
    };

    const roomsRes = await fetch(`${apiBaseUrl}/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `idemp_e2e_${Date.now()}`
      },
      body: JSON.stringify(roomPayload)
    });

    assert.equal(roomsRes.status, 201, "POST /rooms must return status 201");
    const roomData = (await roomsRes.json()) as {
      room: { roomId: string; code: string; gridSize: number; pieceCount: number };
      session: { displayName: string; token: string };
    };

    assert.ok(roomData.room.roomId, "Room must have valid roomId");
    assert.ok(roomData.room.code, "Room must have valid 8-char code");
    assert.equal(roomData.room.gridSize, 6);
    assert.equal(roomData.room.pieceCount, 36);

    // Verify room normalized asset base.webp in R2 storage
    const baseImageBuf = await storage.getBuffer(`rooms/${roomData.room.roomId}/base.webp`);
    assert.ok(baseImageBuf.length > 0, "Base WebP asset must exist in storage");

    // Verify mask metadata JSON in R2 storage
    const masksJsonBuf = await storage.getBuffer(`rooms/${roomData.room.roomId}/masks.json`);
    const masksMeta = JSON.parse(masksJsonBuf.toString("utf8"));
    assert.equal(masksMeta.gridSize, 6);
    assert.equal(masksMeta.pieceCount, 36);

    // Verify asset endpoint access with token
    const assetsRes = await fetch(`${apiBaseUrl}/rooms/${roomData.room.code}/assets`, {
      headers: { Authorization: `Bearer ${roomData.session.token}` }
    });
    assert.equal(assetsRes.status, 200);

    const endTime = performance.now();
    const durationMs = endTime - startTime;

    // SLA assertion: Total execution MUST complete under 5 seconds (5000ms)
    assert.ok(
      durationMs < 5000,
      `Full pipeline took ${durationMs.toFixed(2)}ms, exceeding 5000ms SLA budget`
    );
  });
});
