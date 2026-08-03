import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import WebSocket from "ws";
import { GameMessage } from "@squadpuzzle/protocol";
import { createApp } from "../app.js";
import { RealtimeGatewayServer } from "../services/realtimeGateway.js";
import { getRedisClient } from "../db/redis.js";
import { globalRoomManager } from "../services/roomManager.js";

describe("Real-Time Gateway Connection Layer (Phase 3)", () => {
  let server: http.Server;
  let gatewayServer: RealtimeGatewayServer;
  let serverPort: number;
  let wsUrl: string;

  before(() => {
    return new Promise<void>((resolve) => {
      const app = createApp();
      server = http.createServer(app);
      gatewayServer = new RealtimeGatewayServer();
      gatewayServer.attachToHttpServer(server);

      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          serverPort = address.port;
          wsUrl = `ws://localhost:${serverPort}/realtime`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await gatewayServer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    globalRoomManager.clear();
  });

  async function seedTestRoomAndSession(params?: {
    roomId?: string;
    code?: string;
    sessionId?: string;
    token?: string;
    status?: string;
    expiresAtMs?: number;
  }) {
    const redis = getRedisClient();
    const roomId = params?.roomId || `room_${Math.random().toString(36).substring(7)}`;
    const code = params?.code || "ABC23489";
    const sessionId = params?.sessionId || `sess_${Math.random().toString(36).substring(7)}`;
    const token = params?.token || `tok_${Math.random().toString(36).substring(7)}`;
    const status = params?.status || "active";
    const expiresAtMs = params?.expiresAtMs || Date.now() + 86400000;

    await redis.set(`token:${token}`, JSON.stringify({ roomId, sessionId }));
    await redis.hset(`session:${roomId}:${sessionId}`, {
      sessionId,
      roomId,
      displayName: "Tester",
      displayDisambiguator: "",
      connectedAt: String(Date.now()),
      lastSeenAt: String(Date.now()),
      gracePeriodExpiry: "",
      connectionState: "connected",
      connectionId: ""
    });
    await redis.sadd(`room:${roomId}:sessions`, sessionId);
    await redis.hset(`room:${roomId}:meta`, {
      roomId,
      code,
      status,
      createdAt: String(Date.now()),
      expiresAt: String(expiresAtMs),
      gridSize: "8",
      pieceCount: "64",
      playerCount: "1",
      placedPieceCount: "0",
      completed: "false",
      solveTime: "",
      creatorSessionId: sessionId,
      idleTimerStartedAt: "",
      assetId: "asset_123"
    });

    return { roomId, code, sessionId, token };
  }

  function connectClient(url?: string): Promise<WebSocket> {
    const targetUrl = url || wsUrl;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(targetUrl);
      ws.on("open", () => resolve(ws));
      ws.on("error", (err) => reject(err));
    });
  }

  function receiveNextFrame(ws: WebSocket): Promise<GameMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout waiting for WebSocket frame")), 3000);
      ws.once("message", (data: Buffer) => {
        clearTimeout(timer);
        try {
          const msg = GameMessage.decode(new Uint8Array(data));
          resolve(msg);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  it("1. Rejects WebSocket upgrade requests on paths other than /realtime", async () => {
    const invalidUrl = `ws://localhost:${serverPort}/invalid-path`;
    await assert.rejects(connectClient(invalidUrl));
  });

  it("2. Handshake success: ConnectIntent returns RoomStateSnapshot", async () => {
    const seeded = await seedTestRoomAndSession({ code: "ABC23489", token: "tok_valid1" });

    const ws = await connectClient();

    const connectMsg: GameMessage = {
      schemaVersion: 1,
      roomId: "",
      eventId: 0,
      serverTime: Date.now(),
      connectIntent: {
        roomCode: seeded.code,
        sessionToken: seeded.token
      }
    };

    const encoded = GameMessage.encode(connectMsg).finish();
    ws.send(encoded);

    const response = await receiveNextFrame(ws);
    assert.equal(response.roomId, seeded.roomId);
    assert.ok(response.roomStateSnapshot);
    assert.equal(response.roomStateSnapshot.gridSize, 8);
    assert.equal(response.roomStateSnapshot.pieceCount, 64);

    ws.close();
  });

  it("3. Handshake failure: Non-ConnectIntent first frame returns PROTOCOL_ERROR", async () => {
    const ws = await connectClient();

    const badFirstMsg: GameMessage = {
      schemaVersion: 1,
      roomId: "room_test",
      eventId: 1,
      serverTime: Date.now(),
      heartbeatIntent: {}
    };

    ws.send(GameMessage.encode(badFirstMsg).finish());

    const response = await receiveNextFrame(ws);
    assert.ok(response.errorEvent);
    assert.equal(response.errorEvent.code, "PROTOCOL_ERROR");

    // Wait for connection to be closed by server
    await new Promise<void>((resolve) => ws.on("close", () => resolve()));
  });

  it("4. Handshake failure: Text frame returns PROTOCOL_ERROR", async () => {
    const ws = await connectClient();

    ws.send("Hello world text frame");

    const response = await receiveNextFrame(ws);
    assert.ok(response.errorEvent);
    assert.equal(response.errorEvent.code, "PROTOCOL_ERROR");

    await new Promise<void>((resolve) => ws.on("close", () => resolve()));
  });

  it("5. Handshake failure: Invalid session token returns INVALID_TOKEN", async () => {
    const ws = await connectClient();

    const connectMsg: GameMessage = {
      schemaVersion: 1,
      roomId: "",
      eventId: 0,
      serverTime: Date.now(),
      connectIntent: {
        roomCode: "ANYCODE1",
        sessionToken: "invalid_nonexistent_token"
      }
    };

    ws.send(GameMessage.encode(connectMsg).finish());

    const response = await receiveNextFrame(ws);
    assert.ok(response.errorEvent);
    assert.equal(response.errorEvent.code, "INVALID_TOKEN");

    await new Promise<void>((resolve) => ws.on("close", () => resolve()));
  });

  it("6. Handshake failure: Room not found returns ROOM_NOT_FOUND", async () => {
    const redis = getRedisClient();
    const token = "tok_no_room";
    // Token exists but room meta does not exist
    await redis.set(`token:${token}`, JSON.stringify({ roomId: "room_missing", sessionId: "sess_1" }));
    await redis.hset("session:room_missing:sess_1", { sessionId: "sess_1" });

    const ws = await connectClient();
    const connectMsg: GameMessage = {
      schemaVersion: 1,
      roomId: "",
      eventId: 0,
      serverTime: Date.now(),
      connectIntent: {
        roomCode: "WRONGCOD",
        sessionToken: token
      }
    };

    ws.send(GameMessage.encode(connectMsg).finish());

    const response = await receiveNextFrame(ws);
    assert.ok(response.errorEvent);
    assert.equal(response.errorEvent.code, "ROOM_NOT_FOUND");

    await new Promise<void>((resolve) => ws.on("close", () => resolve()));
  });

  it("7. Handshake failure: Expired room returns ROOM_EXPIRED", async () => {
    const seeded = await seedTestRoomAndSession({
      status: "expired",
      expiresAtMs: Date.now() - 10000
    });

    const ws = await connectClient();
    const connectMsg: GameMessage = {
      schemaVersion: 1,
      roomId: "",
      eventId: 0,
      serverTime: Date.now(),
      connectIntent: {
        roomCode: seeded.code,
        sessionToken: seeded.token
      }
    };

    ws.send(GameMessage.encode(connectMsg).finish());

    const response = await receiveNextFrame(ws);
    assert.ok(response.errorEvent);
    assert.equal(response.errorEvent.code, "ROOM_EXPIRED");

    await new Promise<void>((resolve) => ws.on("close", () => resolve()));
  });

  it("8. Handshake failure: Room full returns ROOM_FULL when 6 connections are active", async () => {
    const roomId = "room_full_test";
    const code = "FULLCODE";

    // Connect 6 active sockets to room_full_test
    const sockets: WebSocket[] = [];
    for (let i = 1; i <= 6; i++) {
      const seeded = await seedTestRoomAndSession({
        roomId,
        code,
        sessionId: `sess_p${i}`,
        token: `tok_p${i}`
      });

      const ws = await connectClient();
      ws.send(
        GameMessage.encode({
          schemaVersion: 1,
          roomId: "",
          eventId: 0,
          serverTime: Date.now(),
          connectIntent: { roomCode: code, sessionToken: seeded.token }
        }).finish()
      );
      await receiveNextFrame(ws); // handshake ok
      sockets.push(ws);
    }

    // Attempt 7th connection for a new session
    const seeded7 = await seedTestRoomAndSession({
      roomId,
      code,
      sessionId: "sess_p7",
      token: "tok_p7"
    });

    const ws7 = await connectClient();
    ws7.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: "",
        eventId: 0,
        serverTime: Date.now(),
        connectIntent: { roomCode: code, sessionToken: seeded7.token }
      }).finish()
    );

    const response = await receiveNextFrame(ws7);
    assert.ok(response.errorEvent);
    assert.equal(response.errorEvent.code, "ROOM_FULL");

    for (const s of sockets) s.close();
    ws7.close();
  });

  it("9. Room-scoped fan-out HARD INVARIANT: Room A broadcast NEVER reaches Room B", async () => {
    const seededA = await seedTestRoomAndSession({ roomId: "room_A", code: "CODEAAAA", sessionId: "sess_A" });
    const seededB = await seedTestRoomAndSession({ roomId: "room_B", code: "CODEBBBB", sessionId: "sess_B" });

    const wsA = await connectClient();
    wsA.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: "",
        eventId: 0,
        serverTime: Date.now(),
        connectIntent: { roomCode: seededA.code, sessionToken: seededA.token }
      }).finish()
    );
    await receiveNextFrame(wsA); // Handshake snapshot

    const wsB = await connectClient();
    wsB.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: "",
        eventId: 0,
        serverTime: Date.now(),
        connectIntent: { roomCode: seededB.code, sessionToken: seededB.token }
      }).finish()
    );
    await receiveNextFrame(wsB); // Handshake snapshot

    let roomBReceived = false;
    wsB.on("message", () => {
      roomBReceived = true;
    });

    const broadcastMsg: GameMessage = {
      schemaVersion: 1,
      roomId: "room_A",
      eventId: 99,
      serverTime: Date.now(),
      playerJoinedEvent: {
        playerSessionId: "sess_new",
        playerName: "NewPlayer",
        displayDisambiguator: "",
        playerCount: 2
      }
    };

    const count = globalRoomManager.broadcastToRoom("room_A", broadcastMsg);
    assert.equal(count, 1);

    // Wait a short time and assert Room B received nothing
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(roomBReceived, false, "HARD INVARIANT VIOLATION: Broadcast to Room A reached Room B connection!");

    wsA.close();
    wsB.close();
  });

  it("10. Duplicate reconnect resolves to one active connection (older connection is closed)", async () => {
    const seeded = await seedTestRoomAndSession();

    const ws1 = await connectClient();
    ws1.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: "",
        eventId: 0,
        serverTime: Date.now(),
        connectIntent: { roomCode: seeded.code, sessionToken: seeded.token }
      }).finish()
    );
    await receiveNextFrame(ws1);

    let ws1Closed = false;
    ws1.on("close", () => {
      ws1Closed = true;
    });

    // 2nd connection with same session token/id
    const ws2 = await connectClient();
    ws2.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: "",
        eventId: 0,
        serverTime: Date.now(),
        connectIntent: { roomCode: seeded.code, sessionToken: seeded.token }
      }).finish()
    );
    const snap2 = await receiveNextFrame(ws2);
    assert.ok(snap2.roomStateSnapshot);

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(ws1Closed, true, "Older connection should be closed on duplicate reconnect");

    ws2.close();
  });

  it("11. Graceful LeaveRoomIntent handling", async () => {
    const seeded = await seedTestRoomAndSession();
    const ws = await connectClient();

    ws.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: "",
        eventId: 0,
        serverTime: Date.now(),
        connectIntent: { roomCode: seeded.code, sessionToken: seeded.token }
      }).finish()
    );
    await receiveNextFrame(ws);

    let closed = false;
    ws.on("close", () => {
      closed = true;
    });

    ws.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: seeded.roomId,
        eventId: 2,
        serverTime: Date.now(),
        leaveRoomIntent: { clientMessageId: "msg_leave_1" }
      }).finish()
    );

    await new Promise((r) => setTimeout(r, 150));
    assert.equal(closed, true);
  });

  it("12. Malformed unparseable Protobuf frame returns PROTOCOL_ERROR and does not crash process", async () => {
    const seeded = await seedTestRoomAndSession();
    const ws = await connectClient();

    ws.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: "",
        eventId: 0,
        serverTime: Date.now(),
        connectIntent: { roomCode: seeded.code, sessionToken: seeded.token }
      }).finish()
    );
    await receiveNextFrame(ws);

    // Send garbage binary payload
    const garbageBytes = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff]);
    ws.send(garbageBytes);

    const response = await receiveNextFrame(ws);
    assert.ok(response.errorEvent);
    assert.equal(response.errorEvent.code, "PROTOCOL_ERROR");

    ws.close();
  });

  it("13. Echo snapshot stub for gameplay intent pipeline test", async () => {
    const seeded = await seedTestRoomAndSession();
    const ws = await connectClient();

    ws.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: "",
        eventId: 0,
        serverTime: Date.now(),
        connectIntent: { roomCode: seeded.code, sessionToken: seeded.token }
      }).finish()
    );
    await receiveNextFrame(ws); // initial snapshot

    // Send a reconnectSyncIntent
    ws.send(
      GameMessage.encode({
        schemaVersion: 1,
        roomId: seeded.roomId,
        eventId: 5,
        serverTime: Date.now(),
        reconnectSyncIntent: { clientMessageId: "sync_1" }
      }).finish()
    );

    const echoedSnapshot = await receiveNextFrame(ws);
    assert.ok(echoedSnapshot.roomStateSnapshot);
    assert.equal(echoedSnapshot.roomId, seeded.roomId);

    ws.close();
  });
});
