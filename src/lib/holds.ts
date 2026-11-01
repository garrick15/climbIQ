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
import { estimateHoldType } from './holdTypes'

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
  // Estimate the physical hold type from the (normalised) box geometry.
  const type = estimateHoldType({ w: b.w, h: b.h })
  return {
    id: `d${i}`,
    name: 'Detected hold',
    x: cx,
    y: cy,
    kind: 'hand' as HoldKind, // refined later by assignment to limbs/route
    rx: Math.min(rx, 22),
    ry: Math.min(ry, 18),
    rot: 0,
    type,
    // color/routeColor are filled by colour sampling in detectHolds().
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

    // Sample each hold's physical colour from the frame (route identity).
    const colors = await sampleBoxColors(frame.dataUrl, boxes)
    const holds = boxes.map((b, i) => {
      const h = boxToHold(b, i)
      h.color = colors[i]?.hex ?? h.color
      h.routeColor = colors[i]?.name
      return h
    })

    return {
      holds,
      frameTime: t,
      rawCount: data.holds?.length ?? 0,
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    console.warn('[ClimbIQ] Hold detection failed:', e)
    return null
  }
}

/** Bucket an RGB colour into a coarse climbing-route colour name. */
export function colorName(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (max < 55) return 'black'
  if (min > 190 && d < 30) return 'white'
  if (d < 32) return 'grey'
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h < 15 || h >= 345) return 'red'
  if (h < 45) return 'orange'
  if (h < 70) return 'yellow'
  if (h < 160) return 'green'
  if (h < 200) return 'teal'
  if (h < 255) return 'blue'
  if (h < 290) return 'purple'
  return 'pink'
}

const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')

/**
 * Sample each box's dominant colour from the detection frame, so holds carry
 * their physical wall colour (→ route identity for the future "which route did
 * you climb" filter). Best-effort: returns the boxes unchanged on any failure.
 */
async function sampleBoxColors(
  dataUrl: string,
  boxes: DetectedBox[],
): Promise<{ hex: string; name: string }[]> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('img load failed'))
      im.src = dataUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return boxes.map(() => ({ hex: '#5b6480', name: 'grey' }))
    ctx.drawImage(img, 0, 0)

    return boxes.map((b) => {
      // Average a small patch at the box centre.
      const cx = Math.round((b.x + b.w / 2) * canvas.width)
      const cy = Math.round((b.y + b.h / 2) * canvas.height)
      const s = 6
      const x0 = Math.max(0, cx - s)
      const y0 = Math.max(0, cy - s)
      const w = Math.min(canvas.width - x0, s * 2)
      const h = Math.min(canvas.height - y0, s * 2)
      if (w <= 0 || h <= 0) return { hex: '#5b6480', name: 'grey' }
      const { data } = ctx.getImageData(x0, y0, w, h)
      let r = 0
      let g = 0
      let bl = 0
      const n = data.length / 4
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]
        g += data[i + 1]
        bl += data[i + 2]
      }
      r /= n
      g /= n
      bl /= n
      return { hex: rgbToHex(r, g, bl), name: colorName(r, g, bl) }
    })
  } catch {
    return boxes.map(() => ({ hex: '#5b6480', name: 'grey' }))
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
