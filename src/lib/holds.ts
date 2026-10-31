/**
 * Climbing-hold detection (Meta SAM 3.1), with mapping into the Visual Beta
 * wall coordinate space.
 *
 * This is a STRETCH feature. Detection from a single phone frame is imperfect,
 * so results are treated as "detected (approximate)" and the caller falls back
 * to pose-derived suggested targets when detection is unavailable or empty.
 */

import { extractFrameAt } from './frames'
import type { PoseTrack, BBox } from './pose-estimation'
import type { Hold, HoldKind } from '../types'

// The BetaWall renders in a fixed 360×540 box (see BetaWall.tsx W/H).
const WALL_W = 360
const WALL_H = 540

interface DetectedBox {
  x: number
  y: number
  w: number
  h: number
  score?: number
}

/** Area (0–1) of the climber's bbox in a frame, or Infinity if none. */
function climberArea(bbox: BBox | null): number {
  return bbox ? bbox.w * bbox.h : Infinity
}

/**
 * Pick the timestamp of the frame where the climber occupies the least area —
 * i.e. the clearest view of the wall/holds. Falls back to the first frame.
 */
function cleanestWallTime(track: PoseTrack): number {
  let bestT = track.frames[0]?.t ?? 0
  let bestArea = Infinity
  for (const f of track.frames) {
    if (!f.landmarks) {
      // A frame with no climber at all is ideal — use it immediately.
      return f.t
    }
    // Reconstruct a rough bbox area from landmark extents.
    let minX = 1
    let minY = 1
    let maxX = 0
    let maxY = 0
    for (const p of f.landmarks) {
      if ((p.visibility ?? 0) < 0.3) continue
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const area = climberArea({ x: minX, y: minY, w: maxX - minX, h: maxY - minY })
    if (area < bestArea) {
      bestArea = area
      bestT = f.t
    }
  }
  return bestT
}

/**
 * Map a normalised SAM box into a wall-space Hold. The detection frame and the
 * pose/wall share the same source image, so normalised coords map directly.
 */
function boxToHold(b: DetectedBox, i: number): Hold {
  const cx = (b.x + b.w / 2) * WALL_W
  const cy = (b.y + b.h / 2) * WALL_H
  const rx = Math.max(6, (b.w * WALL_W) / 2)
  const ry = Math.max(5, (b.h * WALL_H) / 2)
  return {
    id: `d${i}`,
    name: 'Detected hold',
    x: cx,
    y: cy,
    kind: 'hand' as HoldKind, // refined later by assignment to limbs/route
    rx: Math.min(rx, 20),
    ry: Math.min(ry, 16),
    rot: 0,
  }
}

export interface HoldDetection {
  holds: Hold[]
  /** which timestamp the wall frame was taken from */
  frameTime: number
  /** raw count returned by SAM before filtering */
  rawCount: number
}

/**
 * Detect holds for a climb. Returns null if detection is unavailable (no key,
 * network error) or finds nothing usable — the caller then falls back to
 * pose-derived suggested targets.
 */
export async function detectHolds(
  file: File,
  track: PoseTrack,
  signal: AbortSignal,
): Promise<HoldDetection | null> {
  try {
    const t = cleanestWallTime(track)
    const frame = await extractFrameAt(file, t, 768, signal)
    if (!frame) return null

    const res = await fetch('/api/holds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ frame: frame.dataUrl, prompt: 'climbing holds' }),
      signal,
    })
    if (!res.ok) {
      console.warn('[ClimbIQ] Hold detection unavailable:', res.status)
      return null
    }

    const data = (await res.json()) as { holds?: DetectedBox[] }
    const boxes = (data.holds ?? [])
      // drop implausibly large boxes (whole-wall false positives)
      .filter((b) => b.w < 0.45 && b.h < 0.45)
      // keep the most confident ~40 to avoid clutter
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 40)

    if (boxes.length < 3) {
      console.info('[ClimbIQ] SAM returned too few holds; using suggested targets instead.')
      return null
    }

    return {
      holds: boxes.map(boxToHold),
      frameTime: t,
      rawCount: data.holds?.length ?? 0,
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    console.warn('[ClimbIQ] Hold detection failed:', e)
    return null
  }
}

/** Nearest detected hold to a wall-space point, within a tolerance. */
export function nearestHold(holds: Hold[], x: number, y: number, maxDist = 70): Hold | null {
  let best: Hold | null = null
  let bestD = maxDist
  for (const h of holds) {
    const d = Math.hypot(h.x - x, h.y - y)
    if (d < bestD) {
      bestD = d
      best = h
    }
  }
  return best
}
