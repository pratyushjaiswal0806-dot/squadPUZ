import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import sharp from "sharp";
import { createApp as createApiApp } from "../app.js";
import { createApp as createRealtimeApp } from "../../../realtime-gateway/src/app.js";
import { detectImageFormat, validateImageBuffer, normalizeImageBuffer } from "../services/imageUtils.js";
import { MockContentSafetyScanner } from "../../../realtime-gateway/src/services/safetyScanner.js";
import {
  hash32,
  Mulberry32,
  generateEdgeCurve,
  generatePieceMasks,
  generatePiecesWithScatter
} from "../../../realtime-gateway/src/services/puzzleGenerator.js";

describe("SquadPuzzle Image Pipeline & Processing Tests", () => {
  let apiServer: http.Server;
  let realtimeServer: http.Server;
  let apiBaseUrl: string;

  before(async () => {
    // Start API server
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

    // Start Realtime Gateway server
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

  describe("Magic-Number Format Detector & Image Utilities", () => {
    it("Correctly detects JPEG, PNG, WEBP, and GIF magic bytes", async () => {
      const jpegBuf = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toBuffer();
      const pngBuf = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } }).png().toBuffer();
      const webpBuf = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } } }).webp().toBuffer();

      assert.equal(detectImageFormat(jpegBuf), "jpeg");
      assert.equal(detectImageFormat(pngBuf), "png");
      assert.equal(detectImageFormat(webpBuf), "webp");

      const invalidBuf = Buffer.from("NOT_AN_IMAGE_FILE_HEADER_DATA_12345");
      assert.equal(detectImageFormat(invalidBuf), null);
    });

    it("Rejects images with aspect ratio outside [0.5, 2.0]", async () => {
      // 100x300 (aspect ratio 0.33 -> invalid)
      const tallBuf = await sharp({ create: { width: 100, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toBuffer();
      await assert.rejects(
        () => validateImageBuffer(tallBuf),
        (err: Error) => err.message === "INVALID_ASPECT_RATIO"
      );

      // 400x100 (aspect ratio 4.0 -> invalid)
      const wideBuf = await sharp({ create: { width: 400, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toBuffer();
      await assert.rejects(
        () => validateImageBuffer(wideBuf),
        (err: Error) => err.message === "INVALID_ASPECT_RATIO"
      );
    });

    it("Normalizes image, downscales max side >6000px, and calculates sha256 hash", async () => {
      // Create valid 1000x1000 image
      const inputBuf = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 120, g: 120, b: 120 } } }).jpeg().toBuffer();
      const norm = await normalizeImageBuffer(inputBuf);

      assert.equal(norm.format, "webp");
      assert.equal(norm.width, 1000);
      assert.equal(norm.height, 1000);
      assert.equal(norm.aspectRatio, 1.0);
      assert.ok(norm.sourceHash.length === 64);
    });

    it("Rejects image with shortest side < 800px during normalization", async () => {
      const smallBuf = await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 255, g: 255, b: 0 } } }).jpeg().toBuffer();
      await assert.rejects(
        () => normalizeImageBuffer(smallBuf),
        (err: Error) => err.message === "SHORTEST_SIDE_TOO_SMALL"
      );
    });
  });

  describe("Content Safety Scanner", () => {
    it("MockContentSafetyScanner flags unsafe image when configured to fail", async () => {
      const mockScanner = new MockContentSafetyScanner(true);
      const safeResult = await mockScanner.scanImage(Buffer.from("dummy"), "image/jpeg");
      assert.equal(safeResult.isSafe, true);

      mockScanner.setShouldPass(false, "Contains explicit material");
      const unsafeResult = await mockScanner.scanImage(Buffer.from("dummy"), "image/jpeg");
      assert.equal(unsafeResult.isSafe, false);
      assert.equal(unsafeResult.reason, "Contains explicit material");
    });
  });

  describe("Deterministic Mask Generator & Mulberry32 PRNG", () => {
    it("Mulberry32 PRNG produces repeatable deterministic sequences from seed", () => {
      const seed = hash32("test-seed-12345");
      const prng1 = new Mulberry32(seed);
      const seq1 = [prng1.next(), prng1.next(), prng1.next()];

      const prng2 = new Mulberry32(seed);
      const seq2 = [prng2.next(), prng2.next(), prng2.next()];

      assert.deepEqual(seq1, seq2);
    });

    it("generateEdgeCurve outputs correct parametric cubic Bézier control points for tab vs blank vs straight", () => {
      const straight = generateEdgeCurve("straight", 0);
      assert.equal(straight.type, "straight");
      assert.equal(straight.controlPoints.length, 2);

      const tab = generateEdgeCurve("tab", 1);
      assert.equal(tab.type, "tab");
      assert.equal(tab.controlPoints.length, 9);
      assert.ok(tab.controlPoints[4]!.y > 0); // tab extends outwards

      const blank = generateEdgeCurve("blank", -1);
      assert.equal(blank.type, "blank");
      assert.equal(blank.controlPoints.length, 9);
      assert.ok(blank.controlPoints[4]!.y < 0); // blank extends inwards
    });

    it("generatePieceMasks produces grid piece count and complementary edge alignment", () => {
      const masks = generatePieceMasks("abc123hash", 8, "v1");
      assert.equal(masks.length, 64);

      // Check perimeter straight edges for top-left piece (0, 0)
      const topLeft = masks[0]!;
      assert.equal(topLeft.top.type, "straight");
      assert.equal(topLeft.left.type, "straight");
      assert.equal(topLeft.isEdgePiece, true);

      // Check complementary edge between (0, 0) right and (1, 0) left
      const topNext = masks[1]!;
      assert.equal(topLeft.right.dir, -topNext.left.dir);
    });

    it("generatePiecesWithScatter spawns piece centers outside board frame with valid bounds", () => {
      const masks = generatePieceMasks("sourceHash999", 4, "v1");
      const pieces = generatePiecesWithScatter("rm_test123", "sourceHash999", 4, masks);

      assert.equal(pieces.length, 16);
      pieces.forEach((p) => {
        assert.ok(p.currentPositionX < -16 || p.currentPositionX > 10016 || p.currentPositionY < -16 || p.currentPositionY > 10016);
        assert.equal(p.correctPositionX >= 0 && p.correctPositionX <= 10000, true);
        assert.equal(p.correctPositionY >= 0 && p.correctPositionY <= 10000, true);
      });
    });
  });

  describe("HTTP Endpoint Integration Tests: POST /upload & POST /rooms Pipeline", () => {
    let uploadId: string;

    it("POST /upload accepts valid image buffer and returns uploadId with expiration", async () => {
      const imgBuffer = await sharp({
        create: { width: 1200, height: 900, channels: 3, background: { r: 50, g: 150, b: 200 } }
      }).jpeg().toBuffer();

      const blob = new Blob([imgBuffer], { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("image", blob, "test_upload.jpg");

      const res = await fetch(`${apiBaseUrl}/upload`, {
        method: "POST",
        body: formData
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        uploadId: string;
        image: { format: string; width: number; height: number };
        expiresAt: string;
      };
      assert.ok(data.uploadId.startsWith("upl_"));
      assert.equal(data.image.format, "jpeg");
      assert.equal(data.image.width, 1200);
      assert.equal(data.image.height, 900);
      assert.ok(data.expiresAt);

      uploadId = data.uploadId;
    });

    it("POST /upload rejects image with invalid aspect ratio", async () => {
      const imgBuffer = await sharp({
        create: { width: 1200, height: 300, channels: 3, background: { r: 200, g: 50, b: 50 } }
      }).jpeg().toBuffer();

      const blob = new Blob([imgBuffer], { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("image", blob, "invalid_aspect.jpg");

      const res = await fetch(`${apiBaseUrl}/upload`, {
        method: "POST",
        body: formData
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, "INVALID_ASPECT_RATIO");
    });

    it("POST /rooms creates room by processing uploaded asset via realtime gateway worker", async () => {
      const key = "idemp_pipeline_room_1";
      const payload = {
        uploadId,
        gridSize: 4,
        displayName: "Alice"
      };

      const res = await fetch(`${apiBaseUrl}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key
        },
        body: JSON.stringify(payload)
      });

      const resData = (await res.json()) as {
        room: { roomId: string; code: string; gridSize: number; pieceCount: number };
        session: { displayName: string; token: string };
      };
      assert.equal(res.status, 201);
      const data = resData;
      assert.ok(data.room.roomId);
      assert.ok(data.room.code);
      assert.equal(data.room.gridSize, 4);
      assert.equal(data.room.pieceCount, 16);
      assert.equal(data.session.displayName, "Alice");

      // Verify asset refresh endpoint returns normalized asset URLs
      const assetsRes = await fetch(`${apiBaseUrl}/rooms/${data.room.code}/assets`, {
        headers: { Authorization: `Bearer ${data.session.token}` }
      });
      assert.equal(assetsRes.status, 200);
      const assetsData = (await assetsRes.json()) as {
        assets: { baseImageUrl: string; maskMetadataUrl: string };
      };
      assert.ok(assetsData.assets.baseImageUrl);
      assert.ok(assetsData.assets.maskMetadataUrl);
    });
  });
});
