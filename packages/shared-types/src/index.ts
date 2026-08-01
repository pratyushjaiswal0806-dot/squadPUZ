export type RoomStatus = "creating" | "waiting" | "active" | "completed" | "expired" | "destroyed";

export type ConnectionState = "connected" | "grace" | "disconnected" | "left";

export type LockState = "active" | "grace" | "released";

export interface RoomCompletionState {
  completed: boolean;
  placedCount: number;
  completedAt: string | null;
  solveTime: number | null;
}

export interface PieceBounds {
  width: number;
  height: number;
  maskBounds: unknown;
}

export interface Room {
  roomId: string;
  code: string;
  status: RoomStatus;
  createdAt: string;
  expiresAt: string;
  firstClaimedAt: string | null;
  gridSize: number;
  pieceCount: number;
  playerCount: number;
  completionState: RoomCompletionState;
  solveTime: number | null;
  creatorSessionId: string;
  idleTimerStartedAt: string | null;
  assetId: string;
}

export interface Session {
  sessionId: string;
  roomId: string;
  displayName: string;
  displayDisambiguator: string | null;
  connectedAt: string;
  lastSeenAt: string;
  gracePeriodExpiry: string | null;
  connectionState: ConnectionState;
  connectionId: string | null;
}

export interface Piece {
  pieceId: string;
  roomId: string;
  gridX: number;
  gridY: number;
  isEdgePiece: boolean;
  correctPositionX: number;
  correctPositionY: number;
  currentPositionX: number;
  currentPositionY: number;
  zIndex: number;
  placedAt: string | null;
  placedBy: string | null;
  bounds: PieceBounds;
}

export interface PieceLock {
  pieceId: string;
  roomId: string;
  lockedBySessionId: string | null;
  acquiredAt: string | null;
  lastMovedAt: string | null;
  lockState: LockState;
  graceExpiresAt: string | null;
}

export interface ImageAsset {
  assetId: string;
  roomId: string;
  originalUrl: string;
  maskMetadataUrl: string;
  generatedAt: string;
  expiresAt: string;
  sourceHash: string;
  imageWidth: number;
  imageHeight: number;
}