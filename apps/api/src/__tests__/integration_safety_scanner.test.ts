import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { processUploadWorker } from "../../../realtime-gateway/src/services/uploadProcessor.js";
import { MockContentSafetyScanner } from "../../../realtime-gateway/src/services/safetyScanner.js";
import { getRedisClient } from "../../../realtime-gateway/src/db/redis.js";
import { getStorageService } from "../../../realtime-gateway/src/services/s3Client.js";
import { createTestFixtures, type TestImageFixtures } from "./fixtures/imageFixtures.js";

describe("Integration Tests: Safety Scanner & Orphan Cleanup", () => {
  let fixtures: TestImageFixtures;

  before(async () => {
    fixtures = await createTestFixtures();
  });

  it("Rejects unsafe image during upload processing and cleans up all staged objects", async () => {
    const redis = getRedisClient();
    const storage = getStorageService();

    const uploadId = `upl_unsafe_${crypto.randomUUID()}`;
    const roomId = `rm_unsafe_${crypto.randomUUID()}`;
    const stagedKey = `staged/${uploadId}.bin`;

    // 1. Stage upload file in storage and write upload metadata to Redis
    await storage.uploadBuffer(stagedKey, fixtures.jpegBuffer, "image/jpeg", { uploadId });
    await redis.set(
      `upload:${uploadId}`,
      JSON.stringify({
        uploadId,
        format: "jpeg",
        width: 1000,
        height: 1000,
        aspectRatio: 1.0,
        stagedKey
      }),
      { ex: 600 }
    );

    // 2. Instantiate MockContentSafetyScanner set to fail with explicit reason
    const mockScanner = new MockContentSafetyScanner(false, "Explicit content detected");

    // 3. Execute processUploadWorker with unsafe image
    await assert.rejects(
      () =>
        processUploadWorker({
          uploadId,
          roomId,
          gridSize: 4,
          safetyScanner: mockScanner
        }),
      (err: Error) => {
        assert.ok(err.message.includes("Explicit content detected"));
        return true;
      }
    );

    // 4. Assert NO upload key remains in Redis
    const redisUploadMeta = await redis.get(`upload:${uploadId}`);
    assert.equal(redisUploadMeta, null, "Upload metadata in Redis must be cleaned up");

    // 5. Assert NO room asset key exists in Redis
    const redisAsset = await redis.get(`room:${roomId}:asset`);
    assert.equal(redisAsset, null, "No room asset record must exist in Redis");

    // 6. Assert NO object exists in R2 storage for this room
    await assert.rejects(
      () => storage.getBuffer(`rooms/${roomId}/base.webp`),
      "No base image object must exist in R2 storage"
    );
    await assert.rejects(
      () => storage.getBuffer(`rooms/${roomId}/masks.json`),
      "No mask JSON object must exist in R2 storage"
    );
  });
});
