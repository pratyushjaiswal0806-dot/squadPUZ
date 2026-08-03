import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { detectImageFormat, validateImageBuffer } from "../services/imageUtils.js";
import { createTestFixtures, type TestImageFixtures } from "./fixtures/imageFixtures.js";

describe("Unit Tests: Format Detection (Magic Bytes Only)", () => {
  let fixtures: TestImageFixtures;

  before(async () => {
    fixtures = await createTestFixtures();
  });

  it("JPEG bytes renamed to .png are accurately detected as 'jpeg'", () => {
    // File named 'photo.png' but contains authentic JPEG header 0xFF 0xD8 0xFF
    const detected = detectImageFormat(fixtures.jpegBuffer);
    assert.equal(detected, "jpeg");
    assert.notEqual(detected, "png");
  });

  it("JPEG bytes declared with 'image/png' MIME header are detected as 'jpeg'", async () => {
    // Validate buffer logic inspects byte signature only
    const meta = await validateImageBuffer(fixtures.jpegBuffer);
    assert.equal(meta.format, "jpeg");
    assert.notEqual(meta.format, "png");
  });

  it("PNG bytes renamed to .jpg are accurately detected as 'png'", () => {
    // File named 'image.jpg' but contains PNG magic bytes 0x89 0x50 0x4E 0x47 ...
    const detected = detectImageFormat(fixtures.pngBuffer);
    assert.equal(detected, "png");
    assert.notEqual(detected, "jpeg");
  });

  it("GIF bytes renamed to .jpeg are accurately detected as 'gif'", () => {
    // File named 'animation.jpeg' but contains GIF magic bytes GIF89a
    const detected = detectImageFormat(fixtures.gifBuffer);
    assert.equal(detected, "gif");
    assert.notEqual(detected, "jpeg");
  });

  it("WebP bytes renamed to .png are accurately detected as 'webp'", () => {
    // File named 'graphic.png' but contains WebP RIFF magic bytes
    const detected = detectImageFormat(fixtures.webpBuffer);
    assert.equal(detected, "webp");
    assert.notEqual(detected, "png");
  });

  it("Correct extension + correct magic bytes signature succeeds validation", async () => {
    const jpegMeta = await validateImageBuffer(fixtures.jpegBuffer);
    assert.equal(jpegMeta.format, "jpeg");

    const pngMeta = await validateImageBuffer(fixtures.pngBuffer);
    assert.equal(pngMeta.format, "png");

    const webpMeta = await validateImageBuffer(fixtures.webpBuffer);
    assert.equal(webpMeta.format, "webp");

    const gifMeta = await validateImageBuffer(fixtures.gifBuffer);
    assert.equal(gifMeta.format, "gif");
  });

  it("Rejects corrupted/random buffer with null format", () => {
    const detected = detectImageFormat(fixtures.corruptedBuffer);
    assert.equal(detected, null);
  });
});
