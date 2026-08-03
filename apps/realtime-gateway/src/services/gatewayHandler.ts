import { GameMessage } from "@squadpuzzle/protocol";
import { getRedisClient } from "../db/redis.js";
import { globalRoomManager, type ExtendedWebSocket } from "./roomManager.js";
import { logInfo, logWarn, logError } from "../utils/logger.js";

export function sendErrorEventAndClose(
  socket: ExtendedWebSocket,
  code: string,
  message: string,
  context: { roomId?: string; sessionId?: string; connectionId?: string } = {}
): void {
  const errorMsg: GameMessage = {
    schemaVersion: 1,
    roomId: context.roomId || socket.roomId || "",
    eventId: 0,
    serverTime: Date.now(),
    errorEvent: {
      code,
      message,
      contextPieceId: ""
    }
  };

  try {
    if (socket.readyState === socket.OPEN) {
      socket.send(GameMessage.encode(errorMsg).finish());
    }
  } catch (err) {
    logError("Failed to send ErrorEvent before closing socket", err, context);
  }

  logWarn(`Handshake/Protocol error [${code}]: ${message}`, {
    ...context,
    roomId: context.roomId || socket.roomId,
    sessionId: context.sessionId || socket.sessionId,
    connectionId: context.connectionId || socket.connectionId
  });

  // Schedule graceful socket close so client receives the ErrorEvent frame first
  setTimeout(() => {
    try {
      socket.close(1008, message);
    } catch {
      // Socket may already be closed
    }
  }, 50);
}

export async function handleHandshake(
  socket: ExtendedWebSocket,
  connectMsg: GameMessage
): Promise<boolean> {
  const intent = connectMsg.connectIntent;
  if (!intent) {
    sendErrorEventAndClose(socket, "PROTOCOL_ERROR", "First frame must contain ConnectIntent");
    return false;
  }

  const { roomCode, sessionToken } = intent;
  if (!roomCode || !sessionToken) {
    sendErrorEventAndClose(socket, "INVALID_TOKEN", "room_code and session_token are required");
    return false;
  }

  const redis = getRedisClient();

  // 1. Validate session token against Redis (`token:${sessionToken}`)
  const rawTokenMapping = await redis.get(`token:${sessionToken}`);
  if (!rawTokenMapping) {
    sendErrorEventAndClose(socket, "INVALID_TOKEN", "Invalid session token");
    return false;
  }

  let tokenData: { roomId: string; sessionId: string };
  try {
    tokenData = JSON.parse(rawTokenMapping);
  } catch {
    sendErrorEventAndClose(socket, "INVALID_TOKEN", "Malformed session token data");
    return false;
  }

  const { roomId, sessionId } = tokenData;

  // 2. Validate session record exists in Redis (`session:${roomId}:${sessionId}`)
  const sessionHash = await redis.hgetall<Record<string, string>>(`session:${roomId}:${sessionId}`);
  if (!sessionHash || !sessionHash.sessionId) {
    sendErrorEventAndClose(socket, "INVALID_TOKEN", "Session not found");
    return false;
  }

  // 3. Validate room metadata exists in Redis (`room:${roomId}:meta`)
  const roomMeta = await redis.hgetall<Record<string, string>>(`room:${roomId}:${"meta"}`);
  if (!roomMeta || !roomMeta.roomId || !roomMeta.code) {
    sendErrorEventAndClose(socket, "ROOM_NOT_FOUND", "Room not found");
    return false;
  }

  // Validate room code matches (case-insensitive)
  if (roomCode.trim().toUpperCase() !== roomMeta.code.trim().toUpperCase()) {
    sendErrorEventAndClose(socket, "ROOM_NOT_FOUND", "Room code mismatch");
    return false;
  }

  // 4. Validate room status / expiration
  const nowMs = Date.now();
  const expiresAtMs = parseInt(roomMeta.expiresAt || "0", 10);
  if (roomMeta.status === "expired" || roomMeta.status === "destroyed" || (expiresAtMs > 0 && nowMs > expiresAtMs)) {
    sendErrorEventAndClose(socket, "ROOM_EXPIRED", "Room has expired");
    return false;
  }

  // 5. Validate capacity (max 6 active connected sessions)
  const currentActiveSockets = globalRoomManager.getRoomConnectionCount(roomId);
  const existingSocketForSession = globalRoomManager.getSocketForSession(sessionId);

  // If this session is not already connected and room is at capacity (6 active sockets), reject connection
  if (!existingSocketForSession && currentActiveSockets >= 6) {
    sendErrorEventAndClose(socket, "ROOM_FULL", "Room capacity reached", { roomId, sessionId });
    return false;
  }

  // Register socket in RoomManager (this closes older connection for same sessionId if active)
  globalRoomManager.registerConnection(roomId, sessionId, socket);

  logInfo("WebSocket handshake succeeded", {
    roomId,
    sessionId,
    connectionId: socket.connectionId
  });

  // Fetch asset data if present
  let baseImageUrl = "";
  let maskMetadataUrl = "";
  if (roomMeta.assetId) {
    const assetHash = await redis.hgetall<Record<string, string>>(`asset:${roomId}:${roomMeta.assetId}`);
    if (assetHash) {
      baseImageUrl = assetHash.originalUrl || "";
      maskMetadataUrl = assetHash.maskMetadataUrl || "";
    }
  }

  // Fetch active players for state snapshot
  const sessionIds = await redis.smembers(`room:${roomId}:sessions`);
  const playerStates = [];
  for (const sId of sessionIds) {
    const pHash = await redis.hgetall<Record<string, string>>(`session:${roomId}:${sId}`);
    if (pHash && pHash.sessionId) {
      playerStates.push({
        sessionId: pHash.sessionId,
        displayName: pHash.displayName || "",
        displayDisambiguator: pHash.displayDisambiguator || "",
        connectionState: pHash.sessionId === sessionId ? "connected" : pHash.connectionState || "connected"
      });
    }
  }

  // Send RoomStateSnapshot back on successful handshake
  const snapshotMsg: GameMessage = {
    schemaVersion: 1,
    roomId,
    eventId: 1,
    serverTime: Date.now(),
    roomStateSnapshot: {
      lastEventId: 1,
      gridSize: parseInt(roomMeta.gridSize || "8", 10),
      pieceCount: parseInt(roomMeta.pieceCount || "64", 10),
      placedPieceCount: parseInt(roomMeta.placedPieceCount || "0", 10),
      completed: roomMeta.completed === "true",
      solveTimeMs: roomMeta.solveTime ? parseInt(roomMeta.solveTime, 10) : 0,
      baseImageUrl,
      maskMetadataUrl,
      pieces: [],
      players: playerStates,
      locks: []
    }
  };

  socket.send(GameMessage.encode(snapshotMsg).finish());
  return true;
}
