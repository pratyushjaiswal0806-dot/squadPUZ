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

export async function mirrorImageAssetToMongo(assetDoc: Record<string, unknown>): Promise<void> {
  try {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection("imageAssets").updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: assetDoc.assetId as any },
      { $set: assetDoc },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MongoDB Mirror] Error mirroring image asset:", err);
  }
}

export async function mirrorPiecesToMongo(roomId: string, pieces: Record<string, unknown>[]): Promise<void> {
  try {
    const db = await getMongoDb();
    if (!db) return;
    const bulkOps = pieces.map((p) => ({
      updateOne: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filter: { _id: `${roomId}_${p.pieceId}` as any },
        update: { $set: { ...p, roomId } },
        upsert: true
      }
    }));
    if (bulkOps.length > 0) {
      await db.collection("pieces").bulkWrite(bulkOps);
    }
  } catch (err) {
    console.error("[MongoDB Mirror] Error mirroring pieces:", err);
  }
}
