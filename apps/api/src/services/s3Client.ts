import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3";

export interface StorageService {
  uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string>;
  getBuffer(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

export class AwsS3StorageService implements StorageService {
  private client: S3Client;
  private bucket: string;
  private cdnBaseUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET || process.env.S3_BUCKET || "squadpuzzle-assets";
    this.cdnBaseUrl = process.env.CDN_BASE_URL || "";

    const endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || "";
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || "";
    const region = process.env.S3_REGION || "auto";

    this.client = new S3Client({
      region,
      endpoint: endpoint ? endpoint : undefined,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
    });
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata
    });

    await this.client.send(cmd);

    if (this.cdnBaseUrl) {
      const cleanBase = this.cdnBaseUrl.replace(/\/+$/, "");
      return `${cleanBase}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  async getBuffer(key: string): Promise<Buffer> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    const res = await this.client.send(cmd);
    if (!res.Body) {
      throw new Error(`S3 object body is empty for key: ${key}`);
    }
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    const cmd = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    await this.client.send(cmd);
  }

  async deletePrefix(prefix: string): Promise<void> {
    const listCmd = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix
    });
    const listed = await this.client.send(listCmd);
    if (!listed.Contents || listed.Contents.length === 0) return;

    const deleteCmd = new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: {
        Objects: listed.Contents.map((obj) => ({ Key: obj.Key }))
      }
    });
    await this.client.send(deleteCmd);
  }
}

declare global {
  var __squadpuzzle_storage_store__: Map<string, { buffer: Buffer; contentType: string; metadata?: Record<string, string> }> | undefined;
}

const globalInMemoryStore = (globalThis.__squadpuzzle_storage_store__ =
  globalThis.__squadpuzzle_storage_store__ || new Map());

export class InMemoryStorageService implements StorageService {
  private store = globalInMemoryStore;
  private cdnBaseUrl: string;

  constructor() {
    this.cdnBaseUrl = process.env.CDN_BASE_URL || "https://pub-410008a17d1b4c499e5fb1c3b5552608.r2.dev";
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    this.store.set(key, { buffer, contentType, metadata });
    const cleanBase = this.cdnBaseUrl.replace(/\/+$/, "");
    return `${cleanBase}/${key}`;
  }

  async getBuffer(key: string): Promise<Buffer> {
    const item = this.store.get(key);
    if (!item) {
      throw new Error(`Object not found in InMemoryStorageService: ${key}`);
    }
    return item.buffer;
  }

  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
      }
    }
  }
}

let storageInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (storageInstance) {
    return storageInstance;
  }

  const hasAccessKey = Boolean(process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY);
  const hasSecretKey = Boolean(process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY);

  if (process.env.NODE_ENV === "test" && !process.env.USE_REAL_S3_TEST) {
    storageInstance = new InMemoryStorageService();
  } else if (hasAccessKey && hasSecretKey) {
    storageInstance = new AwsS3StorageService();
  } else {
    console.warn("[StorageService] S3 credentials missing. Using InMemoryStorageService.");
    storageInstance = new InMemoryStorageService();
  }

  return storageInstance;
}
