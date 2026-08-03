import { randomBytes, randomUUID } from "node:crypto";
import type { RedisStore } from "../db/redis.js";
import { sanitizeDisplayName } from "../utils/sanitizer.js";
import { AppError } from "../errors.js";
import { mirrorSessionToMongo } from "../db/mongo.js";

export interface SessionData {
  sessionId: string;
  roomId: string;
  displayName: string;
  displayDisambiguator: string | null;
  connectedAt: string; // ISO 8601 string
  lastSeenAt: string; // ISO 8601 string
  gracePeriodExpiry: string | null;
  connectionState: "connected" | "grace" | "disconnected" | "left";
  connectionId: string | null;
}

export interface CreatedSession {
  session: SessionData;
  token: string;
}

export async function createSession(
  redis: RedisStore,
  roomId: string,
  rawDisplayName: string
): Promise<CreatedSession> {
  const sanitizeResult = sanitizeDisplayName(rawDisplayName);
  if (!sanitizeResult.valid) {
    throw new AppError("INVALID_DISPLAY_NAME", sanitizeResult.error || "Invalid display name", {
      statusCode: 400
    });
  }

  const sanitizedName = sanitizeResult.sanitized;

  // Session-local display-name disambiguation via atomic HINCRBY
  const counterKey = `room:${roomId}:name_counters`;
  const count = await redis.hincrby(counterKey, sanitizedName, 1);
  const displayDisambiguator = count > 1 ? String(count) : null;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const sessionId = `sess_${randomUUID()}`;
  const token = randomBytes(32).toString("hex");

  const sessionData: SessionData = {
    sessionId,
    roomId,
    displayName: sanitizedName,
    displayDisambiguator,
    connectedAt: nowIso,
    lastSeenAt: nowIso,
    gracePeriodExpiry: null,
    connectionState: "connected",
    connectionId: null
  };

  // Store session entity fields in Redis Hash session:{roomId}:{sessionId}
  const sessionRedisKey = `session:${roomId}:${sessionId}`;
  await redis.hset(sessionRedisKey, {
    sessionId: sessionData.sessionId,
    roomId: sessionData.roomId,
    displayName: sessionData.displayName,
    displayDisambiguator: sessionData.displayDisambiguator ?? "",
    connectedAt: String(nowMs),
    lastSeenAt: String(nowMs),
    gracePeriodExpiry: "",
    connectionState: sessionData.connectionState,
    connectionId: "",
    token: token
  });
  await redis.expire(sessionRedisKey, 86400);

  // Add sessionId to room sessions set
  await redis.sadd(`room:${roomId}:sessions`, sessionId);
  await redis.expire(`room:${roomId}:sessions`, 86400);

  // Store token mapping in Redis for O(1) Bearer token lookup
  const tokenKey = `token:${token}`;
  await redis.set(tokenKey, JSON.stringify({ roomId, sessionId }), { ex: 86400 });

  // Async mirror to Mongo
  mirrorSessionToMongo({
    _id: sessionId,
    sessionId,
    roomId,
    displayName: sanitizedName,
    displayDisambiguator,
    connectedAt: nowMs,
    lastSeenAt: nowMs,
    connectionState: "connected"
  });

  return { session: sessionData, token };
}

export async function getSessionByToken(
  redis: RedisStore,
  token: string
): Promise<{ roomId: string; sessionId: string; session: SessionData } | null> {
  const tokenKey = `token:${token}`;
  const rawMapping = await redis.get(tokenKey);
  if (!rawMapping) return null;

  try {
    const { roomId, sessionId } = JSON.parse(rawMapping) as { roomId: string; sessionId: string };
    const sessionRedisKey = `session:${roomId}:${sessionId}`;
    const hashData = await redis.hgetall<Record<string, string>>(sessionRedisKey);
    if (!hashData || !hashData.sessionId || !hashData.roomId || !hashData.displayName) return null;

    const connectedAtMs = parseInt(hashData.connectedAt || "0", 10);
    const lastSeenAtMs = parseInt(hashData.lastSeenAt || "0", 10);
    const graceExpiryMs = hashData.gracePeriodExpiry ? parseInt(hashData.gracePeriodExpiry, 10) : null;

    const session: SessionData = {
      sessionId: hashData.sessionId,
      roomId: hashData.roomId,
      displayName: hashData.displayName,
      displayDisambiguator: hashData.displayDisambiguator || null,
      connectedAt: connectedAtMs ? new Date(connectedAtMs).toISOString() : new Date().toISOString(),
      lastSeenAt: lastSeenAtMs ? new Date(lastSeenAtMs).toISOString() : new Date().toISOString(),
      gracePeriodExpiry: graceExpiryMs ? new Date(graceExpiryMs).toISOString() : null,
      connectionState: (hashData.connectionState as SessionData["connectionState"]) || "connected",
      connectionId: hashData.connectionId || null
    };

    return { roomId, sessionId, session };
  } catch (err) {
    console.error("[SessionService] Error parsing session by token:", err);
    return null;
  }
}
