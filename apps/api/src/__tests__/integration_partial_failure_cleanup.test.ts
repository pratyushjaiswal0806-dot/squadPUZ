import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { processUploadWorker } from "../../../realtime-gateway/src/services/uploadProcessor.js";
import { getRedisClient } from "../../../realtime-gateway/src/db/redis.js";
import { getStorageService } from "../../../realtime-gateway/src/services/s3Client.js";
import { createTestFixtures, type TestImageFixtures } from "./fixtures/imageFixtures.js";

describe("Integration Tests: Partial Failure Cleanup & State Recovery", () => {
  let fixtures: TestImageFixtures;

  before(async () => {
    fixtures = await createTestFixtures();
  });

  it("Cleans up temporary files, Redis keys, and partial S3 objects when storage failure occurs", async () => {
    const redis = getRedisClient();
    const storage = getStorageService();

    const uploadId = `upl_fail_${crypto.randomUUID()}`;
    const roomId = `rm_fail_${crypto.randomUUID()}`;
    const stagedKey = `staged/${uploadId}.bin`;

    // 1. Stage upload buffer and Redis metadata
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

    // 2. Monkey-patch uploadBuffer on storage instance to throw error when writing room base image
    const origUploadBuffer = storage.uploadBuffer.bind(storage);
    let errorTriggered = false;

    storage.uploadBuffer = async (key: string, buffer: Buffer, contentType: string, metadata?: Record<string, string>) => {
      if (key.includes("base.webp")) {
        errorTriggered = true;
        throw new Error("Simulated S3 network failure during asset upload");
      }
      return origUploadBuffer(key, buffer, contentType, metadata);
    };

    // 3. Run worker and assert exception is thrown
    try {
      await assert.rejects(
        () =>
          processUploadWorker({
            uploadId,
            roomId,
            gridSize: 4
          }),
        (err: Error) => err.message.includes("Simulated S3 network failure")
      );
    } finally {
      // Restore original uploadBuffer method
      storage.uploadBuffer = origUploadBuffer;
    }

    assert.ok(errorTriggered, "Storage upload failure must have been triggered");

    // 4. Assert cleanups:
    // Staged key deleted or cleaned up
    await assert.rejects(
      () => storage.getBuffer(stagedKey),
      "Staged upload buffer must be deleted from storage after failure"
    );

    // No room asset key in Redis
    const roomAssetMeta = await redis.get(`room:${roomId}:asset`);
    assert.equal(roomAssetMeta, null, "No room asset record must exist in Redis");

    // Room prefix in storage contains zero orphaned objects
    await assert.rejects(
      () => storage.getBuffer(`rooms/${roomId}/base.webp`),
      "Base image object must not exist"
    );
    await assert.rejects(
      () => storage.getBuffer(`rooms/${roomId}/masks.json`),
      "Mask metadata JSON object must not exist"
    );
  });
});
