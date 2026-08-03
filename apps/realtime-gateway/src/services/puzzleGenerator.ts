export function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export class Mulberry32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let z = (this.state += 0x6d2b79f5) >>> 0;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61) >>> 0;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }
}

export type EdgeType = "straight" | "tab" | "blank";

export interface Point2D {
  x: number;
  y: number;
}

export interface EdgeCurveData {
  type: EdgeType;
  dir: number; // 0 for straight, 1 for tab (outward), -1 for blank (inward)
  controlPoints: Point2D[];
}

export interface PieceMaskMetadata {
  pieceId: string;
  gridX: number;
  gridY: number;
  isEdgePiece: boolean;
  top: EdgeCurveData;
  right: EdgeCurveData;
  bottom: EdgeCurveData;
  left: EdgeCurveData;
}

export interface PieceData {
  pieceId: string;
  roomId: string;
  gridX: number;
  gridY: number;
  isEdgePiece: boolean;
  correctPositionX: number;
  correctPositionY: number;
  currentPositionX: number;
  currentPositionY: number;
  zIndex: number;
  placedAt: string | null;
  placedBy: string | null;
  bounds: {
    width: number;
    height: number;
    maskBounds: {
      leftOffset: number;
      rightOffset: number;
      topOffset: number;
      bottomOffset: number;
    };
  };
}

export function generateEdgeCurve(type: EdgeType, dir: number): EdgeCurveData {
  if (type === "straight" || dir === 0) {
    return {
      type: "straight",
      dir: 0,
      controlPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ]
    };
  }

  const d = dir;
  const controlPoints: Point2D[] = [
    { x: 0.0, y: 0.0 },
    { x: 0.35, y: 0.0 },
    { x: 0.38, y: -0.05 * d },
    { x: 0.42, y: 0.18 * d },
    { x: 0.5, y: (0.18 + 0.12) * d },
    { x: 0.58, y: 0.18 * d },
    { x: 0.62, y: -0.05 * d },
    { x: 0.65, y: 0.0 },
    { x: 1.0, y: 0.0 }
  ];

  return {
    type,
    dir: d,
    controlPoints
  };
}

export function generatePieceMasks(
  sourceHash: string,
  gridSize: number,
  generationVersion = "v1"
): PieceMaskMetadata[] {
  const seed = hash32(`${sourceHash}:${gridSize}:${generationVersion}`);
  const prng = new Mulberry32(seed);

  const hEdges: number[][] = Array.from({ length: gridSize - 1 }, () =>
    Array.from({ length: gridSize }, () => (prng.next() < 0.5 ? 1 : -1))
  );
  const vEdges: number[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize - 1 }, () => (prng.next() < 0.5 ? 1 : -1))
  );

  const pieceMasks: PieceMaskMetadata[] = [];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const pieceId = `piece_${x}_${y}`;
      const isEdgePiece = x === 0 || x === gridSize - 1 || y === 0 || y === gridSize - 1;

      const topDir = y === 0 ? 0 : -(vEdges[x]?.[y - 1] ?? 1);
      const topType: EdgeType = topDir === 0 ? "straight" : topDir === 1 ? "tab" : "blank";
      const top = generateEdgeCurve(topType, topDir);

      const bottomDir = y === gridSize - 1 ? 0 : (vEdges[x]?.[y] ?? 1);
      const bottomType: EdgeType = bottomDir === 0 ? "straight" : bottomDir === 1 ? "tab" : "blank";
      const bottom = generateEdgeCurve(bottomType, bottomDir);

      const leftDir = x === 0 ? 0 : -(hEdges[x - 1]?.[y] ?? 1);
      const leftType: EdgeType = leftDir === 0 ? "straight" : leftDir === 1 ? "tab" : "blank";
      const left = generateEdgeCurve(leftType, leftDir);

      const rightDir = x === gridSize - 1 ? 0 : (hEdges[x]?.[y] ?? 1);
      const rightType: EdgeType = rightDir === 0 ? "straight" : rightDir === 1 ? "tab" : "blank";
      const right = generateEdgeCurve(rightType, rightDir);

      pieceMasks.push({
        pieceId,
        gridX: x,
        gridY: y,
        isEdgePiece,
        top,
        right,
        bottom,
        left
      });
    }
  }

  return pieceMasks;
}

export function generatePiecesWithScatter(
  roomId: string,
  sourceHash: string,
  gridSize: number,
  masks: PieceMaskMetadata[]
): PieceData[] {
  const pieceCount = gridSize * gridSize;
  const cellWidth = Math.round(10000 / gridSize);
  const cellHeight = Math.round(10000 / gridSize);

  const scatterSeed = hash32(`${roomId}:${sourceHash}:${gridSize}`);
  const scatterPrng = new Mulberry32(scatterSeed);

  const zIndexes = Array.from({ length: pieceCount }, (_, i) => i + 1);
  for (let i = pieceCount - 1; i > 0; i--) {
    const j = Math.floor(scatterPrng.next() * (i + 1));
    const temp = zIndexes[i] ?? (i + 1);
    zIndexes[i] = zIndexes[j] ?? (j + 1);
    zIndexes[j] = temp;
  }

  const poolRegions = [
    { name: "left", minX: -4500, maxX: -500, minY: -4500, maxY: 14500 },
    { name: "right", minX: 10500, maxX: 14500, minY: -4500, maxY: 14500 },
    { name: "top", minX: -4500, maxX: 14500, minY: -4500, maxY: -500 },
    { name: "bottom", minX: -4500, maxX: 14500, minY: 10500, maxY: 14500 }
  ];

  const placedCenters: Point2D[] = [];
  const pieces: PieceData[] = [];

  for (let i = 0; i < masks.length; i++) {
    const mask = masks[i]!;
    const correctX = Math.round(mask.gridX * cellWidth + cellWidth / 2);
    const correctY = Math.round(mask.gridY * cellHeight + cellHeight / 2);

    let spawnX = 0;
    let spawnY = 0;
    let valid = false;

    for (let retry = 0; retry < 20; retry++) {
      const regionIndex = Math.floor(scatterPrng.next() * poolRegions.length);
      const region = poolRegions[regionIndex]!;

      const candX = Math.round(region.minX + scatterPrng.next() * (region.maxX - region.minX));
      const candY = Math.round(region.minY + scatterPrng.next() * (region.maxY - region.minY));

      const minDistance = cellWidth * 0.3;
      const isOverlap = placedCenters.some((c) => {
        const dx = c.x - candX;
        const dy = c.y - candY;
        return Math.sqrt(dx * dx + dy * dy) < minDistance;
      });

      if (!isOverlap) {
        spawnX = candX;
        spawnY = candY;
        valid = true;
        break;
      }
    }

    if (!valid) {
      const region = poolRegions[i % poolRegions.length]!;
      const col = Math.floor(i / poolRegions.length) % 10;
      const row = Math.floor(i / (poolRegions.length * 10));
      spawnX = Math.round(region.minX + col * cellWidth * 0.8 + 200);
      spawnY = Math.round(region.minY + row * cellHeight * 0.8 + 200);
    }

    placedCenters.push({ x: spawnX, y: spawnY });

    pieces.push({
      pieceId: mask.pieceId,
      roomId,
      gridX: mask.gridX,
      gridY: mask.gridY,
      isEdgePiece: mask.isEdgePiece,
      correctPositionX: correctX,
      correctPositionY: correctY,
      currentPositionX: spawnX,
      currentPositionY: spawnY,
      zIndex: zIndexes[i] ?? (i + 1),
      placedAt: null,
      placedBy: null,
      bounds: {
        width: cellWidth,
        height: cellHeight,
        maskBounds: {
          leftOffset: Math.round(cellWidth * 0.18),
          rightOffset: Math.round(cellWidth * 0.18),
          topOffset: Math.round(cellHeight * 0.18),
          bottomOffset: Math.round(cellHeight * 0.18)
        }
      }
    });
  }

  return pieces;
}
