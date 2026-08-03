import { Redis } from "@upstash/redis";

export interface RedisStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { nx?: boolean; ex?: number }): Promise<string | null | boolean>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, kv: Record<string, unknown>): Promise<number>;
  hgetall<T extends Record<string, string>>(key: string): Promise<T | null>;
  hincrby(key: string, field: string, amount: number): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, ...members: string[]): Promise<number>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

class UpstashRedisAdapter implements RedisStore {
  private client: Redis;

  constructor(url: string, token: string) {
    this.client = new Redis({ url, token });
  }

  async get(key: string): Promise<string | null> {
    const val = await this.client.get<string | unknown>(key);
    if (val === null || val === undefined) return null;
    return typeof val === "string" ? val : JSON.stringify(val);
  }

  async set(key: string, value: string, options?: { nx?: boolean; ex?: number }): Promise<string | null | boolean> {
    if (options?.nx && options?.ex) {
      const res = await this.client.set(key, value, { nx: true, ex: options.ex });
      return res === "OK";
    } else if (options?.nx) {
      const res = await this.client.set(key, value, { nx: true });
      return res === "OK";
    } else if (options?.ex) {
      return await this.client.set(key, value, { ex: options.ex });
    } else {
      return await this.client.set(key, value);
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    const res = await this.client.hget<string>(key, field);
    return res ?? null;
  }

  async hset(key: string, kv: Record<string, unknown>): Promise<number> {
    return await this.client.hset(key, kv);
  }

  async hgetall<T extends Record<string, string>>(key: string): Promise<T | null> {
    const res = await this.client.hgetall<T>(key);
    if (!res || Object.keys(res).length === 0) return null;
    return res;
  }

  async hincrby(key: string, field: string, amount: number): Promise<number> {
    return await this.client.hincrby(key, field, amount);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.client.sadd(key, members[0], ...members.slice(1));
  }

  async smembers(key: string): Promise<string[]> {
    return await this.client.smembers(key);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return await this.client.srem(key, members[0], ...members.slice(1));
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return await this.client.expire(key, seconds);
  }
}

class InMemoryRedisStore implements RedisStore {
  private kv = new Map<string, { value: string; expiresAt?: number }>();
  private hashes = new Map<string, Map<string, string>>();
  private sets = new Map<string, Set<string>>();

  private isExpired(key: string): boolean {
    const item = this.kv.get(key);
    if (!item) return false;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.kv.delete(key);
      return true;
    }
    return false;
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    const item = this.kv.get(key);
    return item ? item.value : null;
  }

  async set(key: string, value: string, options?: { nx?: boolean; ex?: number }): Promise<string | null | boolean> {
    this.isExpired(key);
    if (options?.nx && this.kv.has(key)) {
      return false;
    }
    const expiresAt = options?.ex ? Date.now() + options.ex * 1000 : undefined;
    this.kv.set(key, { value, expiresAt });
    return "OK";
  }

  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashes.get(key);
    if (!hash) return null;
    return hash.get(field) ?? null;
  }

  async hset(key: string, kv: Record<string, unknown>): Promise<number> {
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    let count = 0;
    for (const [f, v] of Object.entries(kv)) {
      if (!hash.has(f)) count++;
      hash.set(f, String(v ?? ""));
    }
    return count;
  }

  async hgetall<T extends Record<string, string>>(key: string): Promise<T | null> {
    const hash = this.hashes.get(key);
    if (!hash || hash.size === 0) return null;
    const res: Record<string, string> = {};
    for (const [f, v] of hash.entries()) {
      res[f] = v;
    }
    return res as T;
  }

  async hincrby(key: string, field: string, amount: number): Promise<number> {
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    const current = parseInt(hash.get(field) || "0", 10);
    const next = current + amount;
    hash.set(field, String(next));
    return next;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set();
      this.sets.set(key, set);
    }
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    }
    return added;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const m of members) {
      if (set.delete(m)) removed++;
    }
    return removed;
  }

  async del(key: string): Promise<number> {
    let count = 0;
    if (this.kv.delete(key)) count++;
    if (this.hashes.delete(key)) count++;
    if (this.sets.delete(key)) count++;
    return count;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.kv.get(key);
    if (item) {
      item.expiresAt = Date.now() + seconds * 1000;
      return 1;
    }
    return 0;
  }
}

let redisInstance: RedisStore | null = null;

export function getRedisClient(): RedisStore {
  if (redisInstance) {
    return redisInstance;
  }

  const url = process.env.UPSTASH_REDIS_URL?.trim();
  const token = process.env.UPSTASH_REDIS_TOKEN?.trim();

  if (url && token) {
    redisInstance = new UpstashRedisAdapter(url, token);
  } else {
    console.warn("[Redis] Missing UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN. Falling back to InMemoryRedisStore.");
    redisInstance = new InMemoryRedisStore();
  }

  return redisInstance;
}
