import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePieceMasks } from "../../../realtime-gateway/src/services/puzzleGenerator.js";

const EPSILON = 1e-6;

function assertApproxEqual(actual: number, expected: number, msg?: string): void {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${msg || "Value mismatch"}: expected ${expected}, got ${actual} (diff: ${Math.abs(actual - expected)})`
  );
}

describe("Unit Tests: Complementary Edge Validation", () => {
  const gridSizes = [4, 6, 8, 10];

  gridSizes.forEach((gridSize) => {
    it(`Programmatically verifies all internal complementary edges for grid size ${gridSize}x${gridSize}`, () => {
      const masks = generatePieceMasks(`test_source_hash_grid_${gridSize}`, gridSize, "v1");
      assert.equal(masks.length, gridSize * gridSize);

      const pieceMap = new Map<string, (typeof masks)[0]>();
      masks.forEach((m) => pieceMap.set(`${m.gridX},${m.gridY}`, m));

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const piece = pieceMap.get(`${x},${y}`)!;
          assert.ok(piece, `Piece at (${x},${y}) must exist`);

          // 1. Outer perimeter edge checks
          if (y === 0) {
            assert.equal(piece.top.type, "straight");
            assert.equal(piece.top.dir, 0);
          }
          if (y === gridSize - 1) {
            assert.equal(piece.bottom.type, "straight");
            assert.equal(piece.bottom.dir, 0);
          }
          if (x === 0) {
            assert.equal(piece.left.type, "straight");
            assert.equal(piece.left.dir, 0);
          }
          if (x === gridSize - 1) {
            assert.equal(piece.right.type, "straight");
            assert.equal(piece.right.dir, 0);
          }

          // 2. Horizontal internal edge check: Piece(x, y).right vs Piece(x+1, y).left
          if (x < gridSize - 1) {
            const neighborRight = pieceMap.get(`${x + 1},${y}`)!;
            assert.ok(neighborRight);

            // Right dir == -Left dir
            assert.equal(
              piece.right.dir,
              -neighborRight.left.dir,
              `Horizontal edge dir mismatch between (${x},${y}) right and (${x+1},${y}) left`
            );

            // Complementary edge type check
            if (piece.right.dir === 1) {
              assert.equal(piece.right.type, "tab");
              assert.equal(neighborRight.left.type, "blank");
            } else if (piece.right.dir === -1) {
              assert.equal(piece.right.type, "blank");
              assert.equal(neighborRight.left.type, "tab");
            }

            // Bezier control point coordinate reflection check
            assert.equal(piece.right.controlPoints.length, neighborRight.left.controlPoints.length);
            for (let i = 0; i < piece.right.controlPoints.length; i++) {
              const ptA = piece.right.controlPoints[i]!;
              const ptB = neighborRight.left.controlPoints[i]!;
              assertApproxEqual(ptA.x, ptB.x, `Control point X mismatch at index ${i}`);
              assertApproxEqual(ptA.y, -ptB.y, `Control point Y reflection mismatch at index ${i}`);
            }
          }

          // 3. Vertical internal edge check: Piece(x, y).bottom vs Piece(x, y+1).top
          if (y < gridSize - 1) {
            const neighborBottom = pieceMap.get(`${x},${y + 1}`)!;
            assert.ok(neighborBottom);

            // Bottom dir == -Top dir
            assert.equal(
              piece.bottom.dir,
              -neighborBottom.top.dir,
              `Vertical edge dir mismatch between (${x},${y}) bottom and (${x},${y+1}) top`
            );

            // Complementary edge type check
            if (piece.bottom.dir === 1) {
              assert.equal(piece.bottom.type, "tab");
              assert.equal(neighborBottom.top.type, "blank");
            } else if (piece.bottom.dir === -1) {
              assert.equal(piece.bottom.type, "blank");
              assert.equal(neighborBottom.top.type, "tab");
            }

            // Bezier control point coordinate reflection check
            assert.equal(piece.bottom.controlPoints.length, neighborBottom.top.controlPoints.length);
            for (let i = 0; i < piece.bottom.controlPoints.length; i++) {
              const ptA = piece.bottom.controlPoints[i]!;
              const ptB = neighborBottom.top.controlPoints[i]!;
              assertApproxEqual(ptA.x, ptB.x, `Control point X mismatch at index ${i}`);
              assertApproxEqual(ptA.y, -ptB.y, `Control point Y reflection mismatch at index ${i}`);
            }
          }
        }
      }
    });
  });
});
