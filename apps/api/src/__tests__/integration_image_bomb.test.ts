import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { validateImageBuffer } from "../services/imageUtils.js";

describe("Integration Tests: Image Decompression Bomb Protection", () => {
  it("Rejects image exceeding Sharp limitInputPixels without crashing worker or leaking memory", async () => {
    // Create a valid 2000x2000 image (4,000,000 pixels)
    const largeBuf = await sharp({
      create: { width: 2000, height: 2000, channels: 3, background: { r: 10, g: 20, b: 30 } }
    })
      .jpeg()
      .toBuffer();

    const memBefore = process.memoryUsage().heapUsed;

    // Test Sharp pixel limit rejection: passing buffer to sharp with tight limitInputPixels (e.g., 500,000)
    await assert.rejects(
      async () => {
        await sharp(largeBuf, { limitInputPixels: 500000 }).metadata();
      },
      (err: Error) => err.message.includes("exceeds pixel limit")
    );

    // Test validateImageBuffer handling of invalid/corrupted bomb header
    const bombHeader = Buffer.alloc(100);
    // JPEG header signature FF D8 FF E0
    bombHeader[0] = 0xff;
    bombHeader[1] = 0xd8;
    bombHeader[2] = 0xff;
    bombHeader[3] = 0xe0;

    await assert.rejects(
      () => validateImageBuffer(bombHeader),
      (err: Error) => err.message === "CORRUPTED_IMAGE"
    );

    const memAfter = process.memoryUsage().heapUsed;
    const memDiffMb = (memAfter - memBefore) / (1024 * 1024);

    // Assert process heap memory remains bounded
    assert.ok(memDiffMb < 50, `Memory consumption spiked excessively: ${memDiffMb.toFixed(2)}MB`);
  });
});
