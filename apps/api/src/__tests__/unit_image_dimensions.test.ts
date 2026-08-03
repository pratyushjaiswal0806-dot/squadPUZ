import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { normalizeImageBuffer, validateImageBuffer } from "../services/imageUtils.js";
import { createTestFixtures, type TestImageFixtures } from "./fixtures/imageFixtures.js";

describe("Unit Tests: Image Dimension Validation & Normalization", () => {
  let fixtures: TestImageFixtures;

  before(async () => {
    fixtures = await createTestFixtures();
  });

  it("Shortest side = 799px is rejected during normalization with SHORTEST_SIDE_TOO_SMALL", async () => {
    await assert.rejects(
      () => normalizeImageBuffer(fixtures.small799Buffer),
      (err: Error) => err.message === "SHORTEST_SIDE_TOO_SMALL"
    );
  });

  it("Shortest side = 800px exactly succeeds normalization", async () => {
    const norm = await normalizeImageBuffer(fixtures.exact800Buffer);
    assert.equal(norm.width, 800);
    assert.equal(norm.height, 800);
    assert.equal(norm.format, "webp");

    // Exact floating point assertion for aspect ratio (800 / 800 = 1.0)
    const expectedAspectRatio = 800 / 800;
    assert.equal(norm.aspectRatio, expectedAspectRatio);
  });

  it("Image larger than 6000px (7000x5250) is safely downscaled to max side 6000px", async () => {
    const norm = await normalizeImageBuffer(fixtures.oversized7000Buffer);

    // Max side 7000 downscaled to 6000
    assert.equal(norm.width, 6000);
    assert.equal(norm.height, 4500);

    // Verify exact aspect ratio preservation (7000 / 5250 = 1.3333333333333333)
    const expectedRatio = 7000 / 5250;
    const actualRatio = norm.width / norm.height;
    assert.ok(
      Math.abs(norm.aspectRatio - expectedRatio) < 1e-6,
      `Aspect ratio mismatch: ${norm.aspectRatio} vs ${expectedRatio}`
    );
    assert.ok(
      Math.abs(actualRatio - expectedRatio) < 1e-6,
      `Dimensions ratio mismatch: ${actualRatio} vs ${expectedRatio}`
    );
  });

  it("Normal image (1000x1000) normalizes with exact dimension and ratio calculation", async () => {
    const meta = await validateImageBuffer(fixtures.jpegBuffer);
    assert.equal(meta.width, 1000);
    assert.equal(meta.height, 1000);
    assert.equal(meta.aspectRatio, 1.0);

    const norm = await normalizeImageBuffer(fixtures.jpegBuffer);
    assert.equal(norm.width, 1000);
    assert.equal(norm.height, 1000);
    assert.equal(norm.aspectRatio, 1.0);
    assert.ok(norm.sourceHash.length === 64, "SHA-256 sourceHash must be 64 hex characters");
  });
});
