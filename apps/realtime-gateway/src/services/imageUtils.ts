import sharp from "sharp";
import crypto from "node:crypto";

export type AllowedFormat = "jpeg" | "png" | "webp" | "gif";

export interface ImageMetadataResult {
  format: AllowedFormat;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface NormalizedImageResult {
  buffer: Buffer;
  format: AllowedFormat;
  width: number;
  height: number;
  aspectRatio: number;
  sourceHash: string;
}

/**
 * Detect format by magic bytes (never trust extension or client MIME type)
 */
export function detectImageFormat(buffer: Buffer): AllowedFormat | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // GIF: GIF87a or GIF89a (47 49 46 38 37|39 61)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return "gif";
  }

  // WEBP: RIFF...WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

/**
 * Perform fast initial validation on uploaded image buffer.
 */
export async function validateImageBuffer(buffer: Buffer): Promise<ImageMetadataResult> {
  const format = detectImageFormat(buffer);
  if (!format) {
    throw new Error("INVALID_FORMAT");
  }

  try {
    const meta = await sharp(buffer, { limitInputPixels: 268435456 }).metadata();
    if (!meta.width || !meta.height) {
      throw new Error("CORRUPTED_IMAGE");
    }

    const aspectRatio = meta.width / meta.height;
    if (aspectRatio < 0.5 || aspectRatio > 2.0) {
      throw new Error("INVALID_ASPECT_RATIO");
    }

    return {
      format,
      width: meta.width,
      height: meta.height,
      aspectRatio
    };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "INVALID_ASPECT_RATIO" || err.message === "INVALID_FORMAT") {
        throw err;
      }
    }
    throw new Error("CORRUPTED_IMAGE");
  }
}

/**
 * Perform full image normalization per TRD Section 9:
 * - EXIF orientation applied
 * - Strip all metadata
 * - First frame if GIF
 * - Reject if shortest side < 800px
 * - Downscale if max side > 6000px
 * - Compute sha256 sourceHash
 */
export async function normalizeImageBuffer(buffer: Buffer): Promise<NormalizedImageResult> {
  const format = detectImageFormat(buffer);
  if (!format) {
    throw new Error("INVALID_FORMAT");
  }

  try {
    let pipeline = sharp(buffer, {
      limitInputPixels: 268435456,
      page: format === "gif" ? 0 : undefined
    })
      .rotate(); // apply EXIF orientation

    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) {
      throw new Error("CORRUPTED_IMAGE");
    }

    const shortestSide = Math.min(meta.width, meta.height);
    if (shortestSide < 800) {
      throw new Error("SHORTEST_SIDE_TOO_SMALL");
    }

    const largestSide = Math.max(meta.width, meta.height);
    if (largestSide > 6000) {
      pipeline = pipeline.resize({
        width: meta.width > meta.height ? 6000 : undefined,
        height: meta.height >= meta.width ? 6000 : undefined,
        fit: "inside",
        withoutEnlargement: true
      });
    }

    // Convert to webp with high quality for uniform output asset
    const normalizedBuffer = await pipeline.webp({ quality: 90 }).toBuffer();
    const finalMeta = await sharp(normalizedBuffer).metadata();
    const finalWidth = finalMeta.width || meta.width;
    const finalHeight = finalMeta.height || meta.height;
    const aspectRatio = finalWidth / finalHeight;

    const sourceHash = crypto.createHash("sha256").update(normalizedBuffer).digest("hex");

    return {
      buffer: normalizedBuffer,
      format: "webp",
      width: finalWidth,
      height: finalHeight,
      aspectRatio,
      sourceHash
    };
  } catch (err) {
    if (err instanceof Error) {
      if (
        err.message === "SHORTEST_SIDE_TOO_SMALL" ||
        err.message === "INVALID_FORMAT" ||
        err.message === "INVALID_ASPECT_RATIO"
      ) {
        throw err;
      }
    }
    throw new Error("CORRUPTED_IMAGE");
  }
}
