import sharp from "sharp";
import crypto from "node:crypto";

export interface TestImageFixtures {
  jpegBuffer: Buffer;
  pngBuffer: Buffer;
  webpBuffer: Buffer;
  gifBuffer: Buffer;
  small799Buffer: Buffer;
  exact800Buffer: Buffer;
  oversized7000Buffer: Buffer;
  large8mbBuffer: Buffer;
  corruptedBuffer: Buffer;
}

export async function createTestFixtures(): Promise<TestImageFixtures> {
  // 1000x1000 standard test image
  const jpegBuffer = await sharp({
    create: { width: 1000, height: 1000, channels: 3, background: { r: 100, g: 150, b: 200 } }
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  const pngBuffer = await sharp({
    create: { width: 1000, height: 1000, channels: 4, background: { r: 50, g: 200, b: 50, alpha: 1 } }
  })
    .png()
    .toBuffer();

  const webpBuffer = await sharp({
    create: { width: 1000, height: 1000, channels: 3, background: { r: 200, g: 100, b: 50 } }
  })
    .webp()
    .toBuffer();

  const gifBuffer = await sharp({
    create: { width: 1000, height: 1000, channels: 3, background: { r: 150, g: 50, b: 150 } }
  })
    .gif()
    .toBuffer();

  // 799x799 (too small)
  const small799Buffer = await sharp({
    create: { width: 799, height: 799, channels: 3, background: { r: 255, g: 0, b: 0 } }
  })
    .jpeg()
    .toBuffer();

  // 800x800 (exactly at minimum boundary)
  const exact800Buffer = await sharp({
    create: { width: 800, height: 800, channels: 3, background: { r: 0, g: 255, b: 0 } }
  })
    .jpeg()
    .toBuffer();

  // 7000x5250 (oversized, needs downscaling to 6000x4500)
  const oversized7000Buffer = await sharp({
    create: { width: 7000, height: 5250, channels: 3, background: { r: 0, g: 0, b: 255 } }
  })
    .jpeg({ quality: 80 })
    .toBuffer();

  // 8MB high resolution image fixture for full pipeline & timing test
  // 3200x2400 high detail noise texture to achieve ~8MB file size safely under 10MB limit
  const noiseRaw = crypto.randomBytes(3200 * 2400 * 3);
  const large8mbBuffer = await sharp(noiseRaw, {
    raw: { width: 3200, height: 2400, channels: 3 }
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  const corruptedBuffer = Buffer.from("NOT_AN_IMAGE_HEADER_CORRUPTED_BYTES_12345");

  return {
    jpegBuffer,
    pngBuffer,
    webpBuffer,
    gifBuffer,
    small799Buffer,
    exact800Buffer,
    oversized7000Buffer,
    large8mbBuffer,
    corruptedBuffer
  };
}
