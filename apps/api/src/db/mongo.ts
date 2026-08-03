import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function getMongoDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    return null;
  }

  if (dbInstance) {
    return dbInstance;
  }

  try {
    client = new MongoClient(uri);
    await client.connect();
    dbInstance = client.db();
    return dbInstance;
  } catch (err) {
    console.error("[MongoDB] Connection error:", err);
    return null;
  }
}

export async function mirrorRoomToMongo(roomDoc: Record<string, unknown>): Promise<void> {
  try {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection("rooms").updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: roomDoc.roomId as any },
      { $set: roomDoc },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MongoDB Mirror] Error mirroring room:", err);
  }
}

export async function mirrorSessionToMongo(sessionDoc: Record<string, unknown>): Promise<void> {
  try {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection("sessions").updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: sessionDoc.sessionId as any },
      { $set: sessionDoc },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MongoDB Mirror] Error mirroring session:", err);
  }
}

export async function mirrorIdempotencyToMongo(key: string, data: Record<string, unknown>): Promise<void> {
  try {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection("idempotencyKeys").updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: key as any },
      { $set: { ...data, createdAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MongoDB Mirror] Error mirroring idempotency key:", err);
  }
}
