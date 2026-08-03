import type { Server } from "node:http";
import { WebSocketServer, type RawData } from "ws";
import { randomUUID } from "node:crypto";
import { GameMessage } from "@squadpuzzle/protocol";
import { globalRoomManager, type ExtendedWebSocket } from "./roomManager.js";
import { handleHandshake, sendErrorEventAndClose } from "./gatewayHandler.js";
import { logInfo, logError } from "../utils/logger.js";

export class RealtimeGatewayServer {
  private wss: WebSocketServer;
  private pingIntervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupListeners();
  }

  /**
   * Attaches WebSocket upgrade listener to existing Node http.Server on path `/realtime`.
   */
  public attachToHttpServer(server: Server): void {
    server.on("upgrade", (request, socket, head) => {
      try {
        const host = request.headers.host || "localhost";
        const url = new URL(request.url || "", `http://${host}`);

        if (url.pathname === "/realtime") {
          this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit("connection", ws, request);
          });
        } else {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
        }
      } catch (err) {
        logError("Error in HTTP upgrade handler", err);
        socket.destroy();
      }
    });

    this.startHeartbeatInterval();
  }

  private setupListeners(): void {
    this.wss.on("connection", (ws: ExtendedWebSocket) => {
      const connectionId = `conn_${randomUUID()}`;
      ws.connectionId = connectionId;
      ws.isAlive = true;
      ws.authenticated = false;

      logInfo("WebSocket connection opened, awaiting ConnectIntent handshake", { connectionId });

      // Handshake timeout: close socket if ConnectIntent is not received within 10s
      const handshakeTimeout = setTimeout(() => {
        if (!ws.authenticated && ws.readyState === ws.OPEN) {
          sendErrorEventAndClose(ws, "PROTOCOL_ERROR", "Handshake timeout", { connectionId });
        }
      }, 10000);

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("message", async (data: RawData, isBinary: boolean) => {
        try {
          if (!isBinary) {
            sendErrorEventAndClose(ws, "PROTOCOL_ERROR", "WebSocket messages must be binary Protobuf frames", {
              connectionId: ws.connectionId,
              roomId: ws.roomId,
              sessionId: ws.sessionId
            });
            return;
          }

          let uint8Array: Uint8Array;
          if (Buffer.isBuffer(data)) {
            uint8Array = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          } else if (data instanceof ArrayBuffer) {
            uint8Array = new Uint8Array(data);
          } else if (Array.isArray(data)) {
            uint8Array = new Uint8Array(Buffer.concat(data));
          } else {
            uint8Array = new Uint8Array(data);
          }

          let gameMessage: GameMessage;
          try {
            gameMessage = GameMessage.decode(uint8Array);
          } catch {
            sendErrorEventAndClose(ws, "PROTOCOL_ERROR", "Failed to decode Protobuf GameMessage frame", {
              connectionId: ws.connectionId,
              roomId: ws.roomId,
              sessionId: ws.sessionId
            });
            return;
          }

          // Case 1: Connection not yet authenticated — first frame MUST be ConnectIntent
          if (!ws.authenticated) {
            clearTimeout(handshakeTimeout);
            const success = await handleHandshake(ws, gameMessage);
            if (!success) {
              // Handshake failed and sendErrorEventAndClose was invoked
              return;
            }
            return;
          }

          // Case 2: Connection is authenticated — handle gameplay/session intents
          await this.handleAuthenticatedMessage(ws, gameMessage);
        } catch (err) {
          logError("Unhandled error processing WebSocket message", err, {
            connectionId: ws.connectionId,
            roomId: ws.roomId,
            sessionId: ws.sessionId
          });
          sendErrorEventAndClose(ws, "PROTOCOL_ERROR", "Internal processing error", {
            connectionId: ws.connectionId,
            roomId: ws.roomId,
            sessionId: ws.sessionId
          });
        }
      });

      ws.on("close", (code, reason) => {
        clearTimeout(handshakeTimeout);
        if (ws.roomId && ws.sessionId) {
          globalRoomManager.unregisterConnection(ws.roomId, ws.sessionId, ws);
          logInfo("WebSocket connection closed", {
            roomId: ws.roomId,
            sessionId: ws.sessionId,
            connectionId: ws.connectionId,
            closeCode: code,
            closeReason: reason.toString("utf8")
          });
        } else {
          logInfo("Unauthenticated WebSocket connection closed", { connectionId: ws.connectionId, closeCode: code });
        }
      });

      ws.on("error", (err) => {
        logError("WebSocket socket error", err, {
          roomId: ws.roomId,
          sessionId: ws.sessionId,
          connectionId: ws.connectionId
        });
      });
    });
  }

  private async handleAuthenticatedMessage(ws: ExtendedWebSocket, msg: GameMessage): Promise<void> {
    const roomId = ws.roomId!;
    const sessionId = ws.sessionId!;
    const connectionId = ws.connectionId!;
    const eventId = msg.eventId;

    // Handle LeaveRoomIntent
    if (msg.leaveRoomIntent) {
      logInfo("Received LeaveRoomIntent from client", {
        roomId,
        sessionId,
        connectionId,
        eventId,
        clientMessageId: msg.leaveRoomIntent.clientMessageId
      });
      try {
        ws.close(1000, "Left room");
      } catch {
        // Ignore close errors
      }
      return;
    }

    // Handle HeartbeatIntent
    if (msg.heartbeatIntent) {
      logInfo("Received HeartbeatIntent from client", {
        roomId,
        sessionId,
        connectionId,
        eventId
      });
      ws.isAlive = true;
      return;
    }

    // Phase 3 Echo Stub: "echo the snapshot back" handler so pipeline is testable end-to-end
    logInfo("Echoing snapshot back for incoming intent", {
      roomId,
      sessionId,
      connectionId,
      eventId
    });

    const responseSnapshot: GameMessage = {
      schemaVersion: 1,
      roomId,
      eventId: Date.now(),
      serverTime: Date.now(),
      roomStateSnapshot: {
        lastEventId: Date.now(),
        gridSize: 8,
        pieceCount: 64,
        placedPieceCount: 0,
        completed: false,
        solveTimeMs: 0,
        baseImageUrl: "",
        maskMetadataUrl: "",
        pieces: [],
        players: [],
        locks: []
      }
    };

    if (ws.readyState === ws.OPEN) {
      ws.send(GameMessage.encode(responseSnapshot).finish());
    }
  }

  /**
   * Ping/Pong Heartbeat Interval:
   * Server sends Ping frame every 5s. If client fails to Pong within 10s (2 missed pings), socket is terminated.
   */
  private startHeartbeatInterval(): void {
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
    }

    this.pingIntervalTimer = setInterval(() => {
      this.wss.clients.forEach((client) => {
        const extWs = client as ExtendedWebSocket;
        if (extWs.isAlive === false) {
          logInfo("Terminating connection due to missed ping/pong heartbeat", {
            roomId: extWs.roomId,
            sessionId: extWs.sessionId,
            connectionId: extWs.connectionId
          });
          if (extWs.roomId && extWs.sessionId) {
            globalRoomManager.unregisterConnection(extWs.roomId, extWs.sessionId, extWs);
          }
          return extWs.terminate();
        }

        extWs.isAlive = false;
        try {
          extWs.ping();
        } catch {
          // If ping fails, terminate on next tick
        }
      });
    }, 5000);
  }

  public close(): Promise<void> {
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = null;
    }
    return new Promise((resolve) => {
      this.wss.close(() => resolve());
    });
  }
}
