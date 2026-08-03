import { randomInt } from "node:crypto";
import type { RedisStore } from "../db/redis.js";
import { AppError } from "../errors.js";

const CODE_CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ROOM_CODE_LENGTH = 8;
const CODE_TTL_SECONDS = 86400; // 24 hours

export function normalizeRoomCode(code: string): string {
  return (code || "").trim().toUpperCase();
}

export function generateRawRoomCode(): string {
  let result = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    result += CODE_CHARSET[randomInt(0, CODE_CHARSET.length)];
  }
  return result;
}

export async function generateUniqueRoomCode(redis: RedisStore, roomId: string): Promise<string> {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = generateRawRoomCode();
    const key = `roomcode:${code}`;
    const setSuccess = await redis.set(key, roomId, { nx: true, ex: CODE_TTL_SECONDS });
    if (setSuccess) {
      return code;
    }
  }

  throw new AppError("SERVER_UNAVAILABLE", "Failed to generate unique room code after maximum retries", {
    statusCode: 500,
    retryable: true
  });
}
