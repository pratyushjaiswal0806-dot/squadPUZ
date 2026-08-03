import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { normalizeImageBuffer } from "../services/imageUtils.js";
import { generatePieceMasks, generatePiecesWithScatter } from "../../../realtime-gateway/src/services/puzzleGenerator.js";
import { createTestFixtures, type TestImageFixtures } from "./fixtures/imageFixtures.js";

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

describe("Unit Tests: Determinism Gate (CRITICAL)", () => {
  let fixtures: TestImageFixtures;

  before(async () => {
    fixtures = await createTestFixtures();
  });

  it("Generates 100% byte-identical outputs across 50 repeated runs for the same seed/sourceHash", async () => {
    const norm = await normalizeImageBuffer(fixtures.jpegBuffer);
    const roomId = "room_det_gate_test_100";
    const gridSize = 8;
    const generationVersion = "v1";

    // Baseline run
    const baseMasks = generatePieceMasks(norm.sourceHash, gridSize, generationVersion);
    const basePieces = generatePiecesWithScatter(roomId, norm.sourceHash, gridSize, baseMasks);

    const baseMasksHash = sha256Hex(JSON.stringify(baseMasks));
    const basePiecesHash = sha256Hex(JSON.stringify(basePieces));
    const baseControlPointsHash = sha256Hex(
      JSON.stringify(baseMasks.map((m) => [m.top.controlPoints, m.right.controlPoints, m.bottom.controlPoints, m.left.controlPoints]))
    );
    const baseScatterHash = sha256Hex(
      JSON.stringify(basePieces.map((p) => ({ id: p.pieceId, x: p.currentPositionX, y: p.currentPositionY })))
    );
    const baseZIndexHash = sha256Hex(JSON.stringify(basePieces.map((p) => p.zIndex)));

    // Perform 50 iterations
    for (let i = 0; i < 50; i++) {
      const masks = generatePieceMasks(norm.sourceHash, gridSize, generationVersion);
      const pieces = generatePiecesWithScatter(roomId, norm.sourceHash, gridSize, masks);

      const masksHash = sha256Hex(JSON.stringify(masks));
      const piecesHash = sha256Hex(JSON.stringify(pieces));
      const controlPointsHash = sha256Hex(
        JSON.stringify(masks.map((m) => [m.top.controlPoints, m.right.controlPoints, m.bottom.controlPoints, m.left.controlPoints]))
      );
      const scatterHash = sha256Hex(
        JSON.stringify(pieces.map((p) => ({ id: p.pieceId, x: p.currentPositionX, y: p.currentPositionY })))
      );
      const zIndexHash = sha256Hex(JSON.stringify(pieces.map((p) => p.zIndex)));

      assert.equal(masksHash, baseMasksHash, `Mask metadata changed at iteration ${i}`);
      assert.equal(piecesHash, basePiecesHash, `Piece payload changed at iteration ${i}`);
      assert.equal(controlPointsHash, baseControlPointsHash, `Bezier control points changed at iteration ${i}`);
      assert.equal(scatterHash, baseScatterHash, `Scatter positions changed at iteration ${i}`);
      assert.equal(zIndexHash, baseZIndexHash, `Z-index ordering changed at iteration ${i}`);
    }
  });

  it("Generates identical sourceHash for identical input image buffers", async () => {
    const norm1 = await normalizeImageBuffer(fixtures.jpegBuffer);
    const norm2 = await normalizeImageBuffer(fixtures.jpegBuffer);

    assert.equal(norm1.sourceHash, norm2.sourceHash);
  });
});
