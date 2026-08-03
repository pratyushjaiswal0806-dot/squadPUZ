import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../app.js";
import { sanitizeDisplayName } from "../utils/sanitizer.js";
import { generateRawRoomCode, normalizeRoomCode } from "../utils/roomCode.js";

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    context: Record<string, unknown> | null;
    retryable: boolean;
  };
}

interface CreateRoomResponse {
  room: {
    roomId: string;
    code: string;
    status: string;
    createdAt: string;
    expiresAt: string;
    gridSize: number;
    pieceCount: number;
  };
  session: {
    sessionId: string;
    token: string;
    displayName: string;
  };
  webSocketUrl: string;
}

interface GetRoomResponse {
  room: {
    roomId: string;
    code: string;
    status: string;
    expiresAt: string;
    gridSize: number;
    pieceCount: number;
    playerCount: number;
    capacity: number;
    completed: boolean;
  };
}

interface JoinRoomResponse {
  session: {
    sessionId: string;
    token: string;
    displayName: string;
    displayDisambiguator: string | null;
  };
  roomStateSnapshot: unknown;
  webSocketUrl: string;
}

interface GetAssetsResponse {
  assets: {
    baseImageUrl: string;
    maskMetadataUrl: string;
    expiresAt: string;
  };
}

describe("SquadPuzzle Phase 1 - Room Management & Session API", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe("Unit Tests: Sanitizer & Code Generator", () => {
    it("Room code generator produces valid 8-char codes from charset", () => {
      const code = generateRawRoomCode();
      assert.equal(code.length, 8);
      assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
    });

    it("normalizeRoomCode trims and converts to uppercase", () => {
      assert.equal(normalizeRoomCode("  abc23489  "), "ABC23489");
    });

    it("Display name sanitizer collapses whitespace, HTML escapes, and validates allowed set", () => {
      const res1 = sanitizeDisplayName("  Sam   Smith  ");
      assert.equal(res1.valid, true);
      assert.equal(res1.sanitized, "Sam Smith");

      const res2 = sanitizeDisplayName("<script>alert('xss')</script>");
      assert.equal(res2.valid, false);

      const res3 = sanitizeDisplayName("Sam & Alex");
      assert.equal(res3.valid, false);

      const res4 = sanitizeDisplayName("User_123-Name");
      assert.equal(res4.valid, true);
      assert.equal(res4.sanitized, "User_123-Name");

      const resControl = sanitizeDisplayName("Sam\u0000Smith");
      assert.equal(resControl.valid, false);
    });

    it("Rate limiter middleware blocks excess requests with 429 and Retry-After header", async () => {
      const { createRateLimiter } = await import("../middleware/rateLimit.js");
      const limiter = createRateLimiter("test_limit", 2, 60);

      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const dummyReq = {
        headers: { "user-agent": "test-agent" },
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" }
      } as unknown as import("express").Request;

      const dummyResHeaders: Record<string, string> = {};
      const dummyRes = {
        headers: dummyResHeaders,
        setHeader(k: string, v: string) {
          dummyResHeaders[k] = v;
        }
      } as unknown as import("express").Response;

      let callCount = 0;
      const nextFn = (err?: unknown) => {
        if (err) throw err;
        callCount++;
      };

      await limiter(dummyReq, dummyRes, nextFn);
      await limiter(dummyReq, dummyRes, nextFn);

      assert.equal(callCount, 2);

      let caughtErr: unknown = null;
      try {
        await limiter(dummyReq, dummyRes, nextFn);
      } catch (e) {
        caughtErr = e;
      }

      assert.ok(caughtErr);
      const errObj = caughtErr as { statusCode: number; code: string };
      assert.equal(errObj.statusCode, 429);
      assert.equal(errObj.code, "RATE_LIMITED");

      process.env.NODE_ENV = oldEnv;
    });
  });

  describe("HTTP Endpoints Integration Tests", () => {
    it("POST /upload returns 501 NOT_IMPLEMENTED with standard error envelope", async () => {
      const res = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=---boundary" }
      });
      assert.equal(res.status, 501);

      const body = (await res.json()) as ErrorResponse;
      assert.equal(body.error.code, "NOT_IMPLEMENTED");
      assert.equal(typeof body.error.message, "string");
      assert.equal(typeof body.error.retryable, "boolean");
    });

    it("POST /rooms without Idempotency-Key returns 400 MISSING_IDEMPOTENCY_KEY", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: "test_123", gridSize: 8, displayName: "Sam" })
      });
      assert.equal(res.status, 400);

      const body = (await res.json()) as ErrorResponse;
      assert.equal(body.error.code, "MISSING_IDEMPOTENCY_KEY");
    });

    it("POST /rooms with uploadId not starting with test_ returns 400 INVALID_UPLOAD", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idemp_test_1"
        },
        body: JSON.stringify({ uploadId: "real_123", gridSize: 8, displayName: "Sam" })
      });
      assert.equal(res.status, 400);

      const body = (await res.json()) as ErrorResponse;
      assert.equal(body.error.code, "INVALID_UPLOAD");
    });

    it("POST /rooms with invalid gridSize returns 400 INVALID_GRID_SIZE", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idemp_test_2"
        },
        body: JSON.stringify({ uploadId: "test_123", gridSize: 12, displayName: "Sam" })
      });
      assert.equal(res.status, 400);

      const body = (await res.json()) as ErrorResponse;
      assert.equal(body.error.code, "INVALID_GRID_SIZE");
    });

    let createdRoomCode: string;
    let creatorToken: string;
    let creatorSessionId: string;

    it("POST /rooms with valid payload creates Room & Creator Session successfully", async () => {
      const key = "idemp_valid_create_1";
      const payload = { uploadId: "test_123", gridSize: 8, displayName: "Sam" };

      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key
        },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 201);

      const body = (await res.json()) as CreateRoomResponse;
      assert.ok(body.room);
      assert.ok(body.session);
      assert.equal(body.room.gridSize, 8);
      assert.equal(body.room.pieceCount, 64);
      assert.equal(body.session.displayName, "Sam");
      assert.ok(body.session.token);

      createdRoomCode = body.room.code;
      creatorToken = body.session.token;
      creatorSessionId = body.session.sessionId;

      // Duplicate submission with SAME key & SAME payload returns identical cached response
      const resDup = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key
        },
        body: JSON.stringify(payload)
      });
      assert.equal(resDup.status, 201);
      const bodyDup = (await resDup.json()) as CreateRoomResponse;
      assert.equal(bodyDup.room.code, createdRoomCode);

      // Duplicate key with DIFFERENT payload returns 409 IDEMPOTENCY_CONFLICT
      const resConflict = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key
        },
        body: JSON.stringify({ uploadId: "test_123", gridSize: 4, displayName: "Sam" })
      });
      assert.equal(resConflict.status, 409);
      const bodyConflict = (await resConflict.json()) as ErrorResponse;
      assert.equal(bodyConflict.error.code, "IDEMPOTENCY_CONFLICT");
    });

    it("GET /rooms/:code returns room metadata", async () => {
      const res = await fetch(`${baseUrl}/rooms/${createdRoomCode.toLowerCase()}`);
      assert.equal(res.status, 200);

      const body = (await res.json()) as GetRoomResponse;
      assert.equal(body.room.code, createdRoomCode);
      assert.equal(body.room.gridSize, 8);
      assert.equal(body.room.capacity, 6);
    });

    it("GET /rooms/INVALID99 returns 404 ROOM_NOT_FOUND", async () => {
      const res = await fetch(`${baseUrl}/rooms/INVALID99`);
      assert.equal(res.status, 404);

      const body = (await res.json()) as ErrorResponse;
      assert.equal(body.error.code, "ROOM_NOT_FOUND");
    });

    it("POST /rooms/:code/join disambiguates duplicate display names ('Sam' -> 'Sam (2)')", async () => {
      const res = await fetch(`${baseUrl}/rooms/${createdRoomCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Sam" })
      });
      assert.equal(res.status, 200);

      const body = (await res.json()) as JoinRoomResponse;
      assert.equal(body.session.displayName, "Sam");
      assert.equal(body.session.displayDisambiguator, "2");
      assert.ok(body.roomStateSnapshot);
      assert.ok(body.webSocketUrl);
    });

    it("POST /rooms/:code/join supports reconnectSessionId", async () => {
      const res = await fetch(`${baseUrl}/rooms/${createdRoomCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Sam", reconnectSessionId: creatorSessionId })
      });
      assert.equal(res.status, 200);

      const body = (await res.json()) as JoinRoomResponse;
      assert.equal(body.session.sessionId, creatorSessionId);
    });

    it("GET /rooms/:code/assets requires valid Bearer token", async () => {
      // Unauthenticated request
      const resNoAuth = await fetch(`${baseUrl}/rooms/${createdRoomCode}/assets`);
      assert.equal(resNoAuth.status, 401);

      // Authenticated request with valid token
      const resAuth = await fetch(`${baseUrl}/rooms/${createdRoomCode}/assets`, {
        headers: { Authorization: `Bearer ${creatorToken}` }
      });
      assert.equal(resAuth.status, 200);

      const body = (await resAuth.json()) as GetAssetsResponse;
      assert.ok(body.assets.baseImageUrl);
      assert.ok(body.assets.maskMetadataUrl);
      assert.ok(body.assets.expiresAt);
    });
  });
});
