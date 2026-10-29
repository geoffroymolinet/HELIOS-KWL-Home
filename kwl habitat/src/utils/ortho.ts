import { Point } from '../../types';

/**
 * Snap a single value to the nearest step.
 */
export const snapValue = (value: number, step: number): number => {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
};

/**
 * Snap a 2D point to a grid with spacing `gridStep` in pixels.
 */
export const snapPointToGrid = (pt: Point, gridStep: number): Point => {
  if (gridStep <= 0) return pt;
  return {
    x: Math.round(pt.x / gridStep) * gridStep,
    y: Math.round(pt.y / gridStep) * gridStep
  };
};

/**
 * Given an anchor point and a target point, constrain the target to a 90-degree angle
 * (strictly horizontal or strictly vertical relative to anchor), optionally snapping along the free axis.
 */
export const getOrthoPoint = (anchor: Point, target: Point, gridStep?: number): Point => {
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal movement: lock y to anchor.y, snap x to grid
    const x = gridStep && gridStep > 0 ? snapValue(target.x, gridStep) : target.x;
    return { x, y: anchor.y };
  } else {
    // Vertical movement: lock x to anchor.x, snap y to grid
    const y = gridStep && gridStep > 0 ? snapValue(target.y, gridStep) : target.y;
    return { x: anchor.x, y };
  }
};

/**
 * Creates an orthogonal 90-degree path between two arbitrary points.
 * If dx and dy are both non-zero, an intermediate 90-degree corner (elbow) is generated.
 */
export const createOrthoSegment = (start: Point, end: Point, preferHorizontalFirst = true, gridStep?: number): Point[] => {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);

  // Already aligned horizontally or vertically
  if (dx < 0.5 || dy < 0.5) {
    return [start, end];
  }

  // Choose intermediate corner based on preference or dominant distance
  const horizontalFirst = preferHorizontalFirst ?? (dx >= dy);
  
  const corner: Point = horizontalFirst
    ? { 
        x: gridStep && gridStep > 0 ? snapValue(end.x, gridStep) : end.x, 
        y: start.y 
      }
    : { 
        x: start.x, 
        y: gridStep && gridStep > 0 ? snapValue(end.y, gridStep) : end.y 
      };

  return [start, corner, end];
};

/**
 * Simplifies a path by removing redundant collinear points on straight horizontal or vertical lines.
 */
export const simplifyCollinearPoints = (path: Point[], tolerance = 0.5): Point[] => {
  if (path.length <= 2) return path;

  const result: Point[] = [path[0]];

  for (let i = 1; i < path.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = path[i];
    const next = path[i + 1];

    // Check if points are collinear along horizontal axis
    const isHorizontal = Math.abs(prev.y - curr.y) < tolerance && Math.abs(curr.y - next.y) < tolerance;
    // Check if points are collinear along vertical axis
    const isVertical = Math.abs(prev.x - curr.x) < tolerance && Math.abs(curr.x - next.x) < tolerance;

    if (!isHorizontal && !isVertical) {
      result.push(curr);
    }
  }

  result.push(path[path.length - 1]);
  return result;
};

/**
 * Takes any existing path (even with diagonal segments) and converts all segments
 * into strict 90-degree right angles with clean intermediate elbows.
 */
export const orthogonalizeFullPath = (path: Point[], gridStep?: number): Point[] => {
  if (path.length < 2) return path;

  const result: Point[] = [path[0]];

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = result[result.length - 1];
    const p2 = path[i + 1];

    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);

    if (dx >= 0.5 && dy >= 0.5) {
      // Diagonal segment: insert 90° elbow
      const horizontalFirst = dx >= dy;
      const corner: Point = horizontalFirst
        ? { x: gridStep && gridStep > 0 ? snapValue(p2.x, gridStep) : p2.x, y: p1.y }
        : { x: p1.x, y: gridStep && gridStep > 0 ? snapValue(p2.y, gridStep) : p2.y };
      result.push(corner);
    }
    result.push(p2);
  }

  return simplifyCollinearPoints(result);
};

/**
 * Computes lateral offsets for N parallel ducts side-by-side with given spacing.
 */
export const getMultiDuctOffsets = (ductsCount: number, spacing: number): number[] => {
  if (ductsCount <= 1) return [0];
  const offsets: number[] = [];
  const half = (ductsCount - 1) / 2;
  for (let i = 0; i < ductsCount; i++) {
    offsets.push((i - half) * spacing);
  }
  return offsets;
};

/**
 * Computes a parallel offset path at distance `offset` perpendicular to path segments.
 * Corners are computed via line intersection so 90° elbows remain perfectly sharp right angles.
 */
export const generateParallelOffsetPath = (path: Point[], offset: number): Point[] => {
  if (path.length < 2 || Math.abs(offset) < 0.1) return path;

  const normals: { nx: number; ny: number; len: number }[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1].x - path[i].x;
    const dy = path[i + 1].y - path[i].y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      normals.push({ nx: 0, ny: 0, len: 0 });
    } else {
      normals.push({ nx: -dy / len, ny: dx / len, len });
    }
  }

  const offsetPoints: Point[] = [];

  // Start point
  const n0 = normals[0];
  offsetPoints.push({
    x: path[0].x + offset * n0.nx,
    y: path[0].y + offset * n0.ny
  });

  // Intermediate corners
  for (let i = 1; i < path.length - 1; i++) {
    const nPrev = normals[i - 1];
    const nCurr = normals[i];
    const p = path[i];

    // Direction vectors
    const vPrevX = p.x - path[i - 1].x;
    const vPrevY = p.y - path[i - 1].y;
    const vCurrX = path[i + 1].x - p.x;
    const vCurrY = path[i + 1].y - p.y;

    // Normal lines
    // Line 1: nPrev.nx * (x - p.x) + nPrev.ny * (y - p.y) = offset
    // In parametric / standard form:
    // Line 1 passes through (p.x + offset * nPrev.nx, p.y + offset * nPrev.ny) with direction (vPrevX, vPrevY)
    const p1x = p.x + offset * nPrev.nx;
    const p1y = p.y + offset * nPrev.ny;
    const p2x = p.x + offset * nCurr.nx;
    const p2y = p.y + offset * nCurr.ny;

    // Line 1 equation: -vPrevY * x + vPrevX * y = -vPrevY * p1x + vPrevX * p1y
    const a1 = -vPrevY;
    const b1 = vPrevX;
    const c1 = a1 * p1x + b1 * p1y;

    const a2 = -vCurrY;
    const b2 = vCurrX;
    const c2 = a2 * p2x + b2 * p2y;

    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) > 1e-4) {
      const ix = (c1 * b2 - c2 * b1) / det;
      const iy = (a1 * c2 - a2 * c1) / det;
      // Clamp extreme corner spikes (if acute)
      const distFromOriginal = Math.hypot(ix - p.x, iy - p.y);
      if (distFromOriginal > Math.abs(offset) * 2.5) {
        offsetPoints.push({
          x: p.x + offset * (nPrev.nx + nCurr.nx) * 0.5,
          y: p.y + offset * (nPrev.ny + nCurr.ny) * 0.5
        });
      } else {
        offsetPoints.push({ x: ix, y: iy });
      }
    } else {
      // Parallel segments
      offsetPoints.push({
        x: p.x + offset * nCurr.nx,
        y: p.y + offset * nCurr.ny
      });
    }
  }

  // End point
  const nLast = normals[normals.length - 1];
  offsetPoints.push({
    x: path[path.length - 1].x + offset * nLast.nx,
    y: path[path.length - 1].y + offset * nLast.ny
  });

  return offsetPoints;
};
