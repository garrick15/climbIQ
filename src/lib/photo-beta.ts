/**
 * Photo → suggested beta.
 *
 * Given a still photo of a bouldering wall (no climber, no pose), detect the
 * holds, optionally keep only one route colour, plan a plausible bottom-to-top
 * sequence, and ask Muse Spark to turn it into a suggested climbing beta.
 *
 * This is a SUGGESTION from a single 2D photo: reach/feasibility is estimated,
 * holds & colours are approximate. The UI labels it as suggested, not a graded
 * or guaranteed sequence.
 */

import { extractFrameAt } from './frames'
import { colorName } from './holds'
import { estimateHoldType } from './holdTypes'
import type { Analysis, BetaStep, Hold, LimbState } from '../types'

const WALL_W = 360
const WALL_H = 540

interface DetectedBox {
  x: number
  y: number
  w: number
  h: number
  score?: number
}

export interface PhotoBetaProgress {
  stage: number
  fraction: number
}

export const PHOTO_PIPELINE = [
  { id: 'read', label: 'Reading photo', detail: 'Preparing the image' },
  { id: 'holds', label: 'Detecting holds', detail: 'SAM 3.1 segmenting the wall' },
  { id: 'route', label: 'Planning a route', detail: 'Linking holds bottom to top' },
  { id: 'coach', label: 'Writing the beta', detail: 'Muse Spark suggesting the moves' },
] as const

export interface PhotoBetaResult {
  analysis: Analysis
  /** the photo as a data URL, shown behind the beta overlay */
  imageUrl: string
  usedFallback: boolean
  fallbackReason?: string
  /** route colours found, for the colour picker */
  availableColors: { name: string; hex: string; count: number }[]
}

/** Load an image file into dimensions + a (possibly downscaled) data URL. */
async function readImage(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('Could not read this image.'))
      im.src = url
    })
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable.')
    ctx.drawImage(img, 0, 0, w, h)
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), w, h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Sample a box's dominant colour from an already-decoded canvas context. */
function sampleColor(ctx: CanvasRenderingContext2D, cw: number, ch: number, b: DetectedBox) {
  const cx = Math.round((b.x + b.w / 2) * cw)
  const cy = Math.round((b.y + b.h / 2) * ch)
  const s = 6
  const x0 = Math.max(0, cx - s)
  const y0 = Math.max(0, cy - s)
  const w = Math.min(cw - x0, s * 2)
  const h = Math.min(ch - y0, s * 2)
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
  const hex =
    '#' + [r, g, bl].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  return { hex, name: colorName(r, g, bl) }
}

/** Build Hold objects (wall space) from detected boxes, with type + colour. */
async function boxesToHolds(dataUrl: string, boxes: DetectedBox[]): Promise<Hold[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('img load failed'))
    im.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)

  return boxes.map((b, i) => {
    const type = estimateHoldType({ w: b.w, h: b.h })
    const col = sampleColor(ctx, canvas.width, canvas.height, b)
    return {
      id: `p${i}`,
      name: 'Detected hold',
      x: (b.x + b.w / 2) * WALL_W,
      y: (b.y + b.h / 2) * WALL_H,
      kind: 'off' as const,
      rx: Math.min(Math.max(6, (b.w * WALL_W) / 2), 22),
      ry: Math.min(Math.max(5, (b.h * WALL_H) / 2), 18),
      rot: 0,
      type,
      color: col.hex,
      routeColor: col.name,
    }
  })
}

/**
 * Plan a plausible route: start from the lowest 1-2 holds, then greedily step
 * to the nearest higher hold within reach, until near the top. Returns ordered
 * hold ids (hands). This is a heuristic, not a solver.
 */
function planRoute(holds: Hold[]): string[] {
  if (holds.length === 0) return []
  const byLow = [...holds].sort((a, b) => b.y - a.y) // bottom first (larger y)
  const used = new Set<string>()
  const seq: string[] = []
  let current = byLow[0]
  seq.push(current.id)
  used.add(current.id)

  const REACH = 150 // wall-space units a hand can plausibly span

  for (let guard = 0; guard < holds.length; guard++) {
    // candidates: higher than current (smaller y), not used, within reach
    let best: Hold | null = null
    let bestScore = Infinity
    for (const h of holds) {
      if (used.has(h.id)) continue
      if (h.y >= current.y - 4) continue // must go up
      const d = Math.hypot(h.x - current.x, h.y - current.y)
      if (d > REACH) continue
      // prefer the hold that is up and not too far sideways
      const score = d + Math.abs(h.x - current.x) * 0.5
      if (score < bestScore) {
        bestScore = score
        best = h
      }
    }
    if (!best) break
    seq.push(best.id)
    used.add(best.id)
    current = best
  }
  return seq
}

/** Assemble an Analysis for the photo route from Muse Spark output + holds. */
function buildPhotoAnalysis(
  coach: { beta?: unknown; metrics?: unknown },
  holds: Hold[],
  routeIds: string[],
  durationSec: number,
): Analysis {
  const byId = new Map(holds.map((h) => [h.id, h]))
  const asArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const str = (v: unknown, f = '') => (typeof v === 'string' ? v : f)

  // Mark route holds hand/foot/finish for rendering.
  routeIds.forEach((id, i) => {
    const h = byId.get(id)
    if (h) h.kind = i === routeIds.length - 1 ? 'finish' : 'hand'
  })

  const rawBeta = asArr<Record<string, unknown>>(coach.beta)
  const beta: BetaStep[] = rawBeta.length
    ? rawBeta.map((s, i) => {
        // Map this step to a hold id along the route.
        const holdId = routeIds[Math.min(i, routeIds.length - 1)]
        const prevId = routeIds[Math.max(0, i - 1)]
        const footId = routeIds[Math.max(0, i - 2)]
        const limbs: LimbState =
          i % 2 === 0
            ? { rh: holdId, lh: prevId, rf: footId, lf: footId }
            : { lh: holdId, rh: prevId, lf: footId, rf: footId }
        return {
          id: str(s.id) || `step-${i + 1}`,
          title: str(s.title, `Move ${i + 1}`),
          summary: str(s.summary),
          bodyPosition: str(s.bodyPosition),
          why: str(s.why),
          yourAttempt: '', // no climber in a photo
          timestamp: (i / Math.max(1, rawBeta.length)) * durationSec,
          limbs,
          hipShift: 0,
          cue: { text: str(s.title, '').slice(0, 26), side: i % 2 === 0 ? 'right' : 'left' },
        }
      })
    : // Fallback: one move per route hold if the model returned no beta.
      routeIds.map((id, i) => {
        const prevId = routeIds[Math.max(0, i - 1)]
        const footId = routeIds[Math.max(0, i - 2)]
        return {
          id: `step-${i + 1}`,
          title: i === routeIds.length - 1 ? 'Top out' : `Move to hold ${i + 1}`,
          summary: 'Suggested from the detected route.',
          bodyPosition: '',
          why: '',
          yourAttempt: '',
          timestamp: (i / Math.max(1, routeIds.length)) * durationSec,
          limbs:
            i % 2 === 0
              ? { rh: id, lh: prevId, rf: footId, lf: footId }
              : { lh: id, rh: prevId, lf: footId, rf: footId },
          hipShift: 0,
          cue: { text: '', side: i % 2 === 0 ? 'right' : 'left' },
        } as BetaStep
      })

  return {
    source: 'ai',
    provenance: {
      poseDetectionRate: 0,
      framesSampled: 1,
      holdsDetected: true,
      notes: [
        'Suggested beta planned from a single photo — no climber was analysed.',
        'Holds, colours and reach are approximate; treat the sequence as a suggestion.',
      ],
    },
    climb: { outcome: 'Suggested route', durationSec, moves: beta.length, holdsDetected: holds.length },
    metrics: asArr<Record<string, unknown>>(coach.metrics).map((m, i) => ({
      id: str(m.id) || `m-${i}`,
      label: str(m.label, 'Note'),
      value: typeof m.value === 'number' ? m.value : 0,
      note: str(m.note),
    })),
    holds,
    beta,
    feedback: [],
    training: [],
  }
}

/** Run the full photo→beta pipeline. */
export async function betaFromPhoto(opts: {
  file: File
  /** optional route colour name to keep (e.g. 'red'); undefined = all holds */
  routeColor?: string
  signal: AbortSignal
  onProgress: (p: PhotoBetaProgress) => void
}): Promise<PhotoBetaResult> {
  const { file, routeColor, signal, onProgress } = opts
  const DURATION = 40

  onProgress({ stage: 0, fraction: 0.5 })
  const { dataUrl } = await readImage(file)

  const fail = (reason: string, holds: Hold[] = []): PhotoBetaResult => ({
    analysis: buildPhotoAnalysis({}, holds, [], DURATION),
    imageUrl: dataUrl,
    usedFallback: true,
    fallbackReason: reason,
    availableColors: [],
  })

  // Detect holds via the SAM proxy.
  onProgress({ stage: 1, fraction: 0.2 })
  let boxes: DetectedBox[] = []
  try {
    const res = await fetch('/api/holds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ frame: dataUrl, prompt: 'climbing holds' }),
      signal,
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      return fail(
        err.error === 'missing_api_key'
          ? 'No Meta API key is configured, so holds could not be detected.'
          : `Hold detection service returned ${res.status}.`,
      )
    }
    const data = (await res.json()) as { holds?: DetectedBox[] }
    boxes = (data.holds ?? []).filter((b) => b.w < 0.45 && b.h < 0.45).slice(0, 60)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    return fail('Hold detection failed. Try a clearer, well-lit photo of the wall.')
  }
  if (boxes.length < 3) return fail('Too few holds detected. Try a clearer, straight-on photo of the wall.')

  onProgress({ stage: 1, fraction: 1 })
  let holds = await boxesToHolds(dataUrl, boxes)

  // Colour summary for the picker.
  const colorMap = new Map<string, { name: string; hex: string; count: number }>()
  for (const h of holds) {
    const key = h.routeColor ?? 'grey'
    const e = colorMap.get(key)
    if (e) e.count++
    else colorMap.set(key, { name: key, hex: h.color ?? '#5b6480', count: 1 })
  }
  const availableColors = [...colorMap.values()].sort((a, b) => b.count - a.count)

  // Optionally keep only the chosen route colour.
  if (routeColor) {
    const filtered = holds.filter((h) => h.routeColor === routeColor)
    if (filtered.length >= 3) holds = filtered
  }

  // Plan the route.
  onProgress({ stage: 2, fraction: 0.5 })
  const routeIds = planRoute(holds)
  if (routeIds.length < 2) return fail('Could not link the holds into a route on this photo.', holds)
  onProgress({ stage: 2, fraction: 1 })

  // Ask Muse Spark for the beta text.
  onProgress({ stage: 3, fraction: 0.2 })
  const routeHolds = routeIds.map((id, i) => {
    const h = holds.find((x) => x.id === id)!
    return {
      order: i + 1,
      x: Math.round((h.x / WALL_W) * 100) / 100,
      y: Math.round((h.y / WALL_H) * 100) / 100,
      type: h.type,
      color: h.routeColor,
    }
  })

  let coach: { beta?: unknown; metrics?: unknown } = {}
  try {
    const res = await fetch('/api/beta-from-photo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ route: routeHolds, routeColor, frame: dataUrl }),
      signal,
    })
    if (res.ok) {
      const data = (await res.json()) as { analysis?: { beta?: unknown; metrics?: unknown } }
      if (data.analysis) coach = data.analysis
    } else {
      console.warn('[ClimbIQ] photo beta coaching unavailable:', res.status)
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    console.warn('[ClimbIQ] photo beta coaching failed:', e)
  }
  onProgress({ stage: 3, fraction: 1 })

  return {
    analysis: buildPhotoAnalysis(coach, holds, routeIds, DURATION),
    imageUrl: dataUrl,
    usedFallback: false,
    availableColors,
  }
}
