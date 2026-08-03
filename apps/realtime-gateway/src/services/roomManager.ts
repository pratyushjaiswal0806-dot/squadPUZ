import type { WebSocket } from "ws";
import { GameMessage } from "@squadpuzzle/protocol";
import { logInfo } from "../utils/logger.js";

export interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
  roomId?: string;
  sessionId?: string;
  connectionId?: string;
  authenticated?: boolean;
}

export class RoomManager {
  // Map of roomId -> Set of active WebSockets subscribed to that room
  private rooms: Map<string, Set<ExtendedWebSocket>> = new Map();
  // Map of sessionId -> active WebSocket (for duplicate reconnect resolution)
  private sessionSockets: Map<string, ExtendedWebSocket> = new Map();

  /**
   * Registers a connection to a room.
   * If an existing connection exists for the same sessionId, closes the older connection.
   */
  public registerConnection(roomId: string, sessionId: string, socket: ExtendedWebSocket): void {
    const existingSocket = this.sessionSockets.get(sessionId);
    if (existingSocket && existingSocket !== socket && existingSocket.readyState === existingSocket.OPEN) {
      logInfo("Closing older duplicate connection for session", {
        roomId,
        sessionId,
        connectionId: socket.connectionId
      });
      try {
        existingSocket.close(1000, "Duplicate connection replaced by new session handshake");
      } catch {
        // Ignore close errors
      }
      this.unregisterConnection(roomId, sessionId, existingSocket);
    }

    let roomSet = this.rooms.get(roomId);
    if (!roomSet) {
      roomSet = new Set();
      this.rooms.set(roomId, roomSet);
    }
    roomSet.add(socket);
    this.sessionSockets.set(sessionId, socket);

    socket.roomId = roomId;
    socket.sessionId = sessionId;
    socket.authenticated = true;
  }

  /**
   * Removes a connection from a room and session map.
   */
  public unregisterConnection(roomId: string, sessionId: string, socket: ExtendedWebSocket): void {
    const roomSet = this.rooms.get(roomId);
    if (roomSet) {
      roomSet.delete(socket);
      if (roomSet.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    if (this.sessionSockets.get(sessionId) === socket) {
      this.sessionSockets.delete(sessionId);
    }
  }

  /**
   * Broadcasts a GameMessage protobuf to all sockets subscribed to a specific room.
   * NEVER reaches sockets subscribed to other rooms.
   */
  public broadcastToRoom(roomId: string, message: GameMessage, excludeSocket?: ExtendedWebSocket): number {
    const roomSet = this.rooms.get(roomId);
    if (!roomSet || roomSet.size === 0) {
      return 0;
    }

    const encodedBuffer = GameMessage.encode(message).finish();
    let sentCount = 0;

    for (const clientSocket of roomSet) {
      if (clientSocket === excludeSocket) {
        continue;
      }
      if (clientSocket.readyState === clientSocket.OPEN) {
        clientSocket.send(encodedBuffer);
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Returns the count of active WebSockets in a room.
   */
  public getRoomConnectionCount(roomId: string): number {
    const roomSet = this.rooms.get(roomId);
    return roomSet ? roomSet.size : 0;
  }

  /**
   * Returns active WebSocket for a sessionId if present.
   */
  public getSocketForSession(sessionId: string): ExtendedWebSocket | undefined {
    return this.sessionSockets.get(sessionId);
  }

  /**
   * Returns total tracked rooms.
   */
  public getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Clears all room mappings (useful for test resets).
   */
  public clear(): void {
    this.rooms.clear();
    this.sessionSockets.clear();
  }
}

export const globalRoomManager = new RoomManager();
