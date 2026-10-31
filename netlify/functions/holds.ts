/**
 * ClimbIQ — climbing-hold detection via Meta SAM 3.1 (Netlify).
 *
 * Takes one wall frame (base64 data URL) and asks SAM 3.1 to segment climbing
 * holds. Returns normalised bounding boxes (0–1), one per detected hold, which
 * the frontend maps onto the Visual Beta wall.
 *
 * SAM 3.1 is a STRETCH feature: detection from a single phone frame is
 * imperfect (holds blend into the wall, occlusion, lighting). Results are
 * returned as "detected (approximate)" and the UI labels them as such.
 *
 * Uses the same server-side META_API_KEY. Model: sam-3.1 on the Responses API.
 */

import type { Config, Context } from '@netlify/functions'

interface HoldsRequest {
  /** base64 data URL of a wall frame */
  frame: string
  /** noun phrase prompt; defaults to "climbing holds" */
  prompt?: string
}

interface DetectedBox {
  /** normalised 0–1 */
  x: number
  y: number
  w: number
  h: number
  score?: number
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Best-effort extraction of boxes from a SAM Responses payload.
 *
 * The official decoder is @meta-sam/parser, but SAM emits boxes in a few
 * shapes depending on options. We scan the response for any object carrying a
 * recognisable box and normalise it. Coordinates may arrive normalised (0–1)
 * or in pixels; we normalise against the frame size when it looks like pixels.
 */
function extractBoxes(payload: unknown, frameW: number, frameH: number): DetectedBox[] {
  const out: DetectedBox[] = []
  const pushBox = (x: number, y: number, w: number, h: number, score?: number) => {
    // Heuristic: if any value > 1.5, treat as pixels and normalise.
    const looksPixel = x > 1.5 || y > 1.5 || w > 1.5 || h > 1.5
    const nx = looksPixel ? x / frameW : x
    const ny = looksPixel ? y / frameH : y
    const nw = looksPixel ? w / frameW : w
    const nh = looksPixel ? h / frameH : h
    if (nw <= 0 || nh <= 0 || nw > 1.2 || nh > 1.2) return
    out.push({ x: clamp01(nx), y: clamp01(ny), w: clamp01(nw), h: clamp01(nh), score })
  }

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const o = node as Record<string, unknown>

    // Common shapes: {box:[x,y,w,h]} or {bbox:[x1,y1,x2,y2]} or {x,y,width,height}
    const box = (o.box ?? o.bbox ?? o.bounding_box) as unknown
    if (Array.isArray(box) && box.length === 4 && box.every((n) => typeof n === 'number')) {
      const [a, b, c, d] = box as number[]
      // xywh vs xyxy: if c<a or d<b it's not xyxy; assume xywh unless clearly xyxy
      const isXYXY = c > a && d > b && (c <= 1.01 || d <= 1.01 || c > a + 1)
      if (isXYXY) pushBox(a, b, c - a, d - b, typeof o.score === 'number' ? o.score : undefined)
      else pushBox(a, b, c, d, typeof o.score === 'number' ? o.score : undefined)
    } else if (
      typeof o.x === 'number' &&
      typeof o.y === 'number' &&
      (typeof o.width === 'number' || typeof o.w === 'number') &&
      (typeof o.height === 'number' || typeof o.h === 'number')
    ) {
      pushBox(
        o.x,
        o.y,
        (o.width ?? o.w) as number,
        (o.height ?? o.h) as number,
        typeof o.score === 'number' ? o.score : undefined,
      )
    }

    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach(visit)
      else if (v && typeof v === 'object') visit(v)
    }
  }

  visit(payload)
  return out
}

export default async function handler(req: Request, _ctx: Context): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'Use POST.' }, 405)

  const apiKey = process.env.META_API_KEY
  if (!apiKey) return json({ error: 'missing_api_key', message: 'META_API_KEY is not set.' }, 501)

  let payload: HoldsRequest
  try {
    payload = (await req.json()) as HoldsRequest
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!payload?.frame) return json({ error: 'invalid_body', message: 'Expected a "frame" data URL.' }, 400)

  const baseUrl = process.env.META_API_BASE_URL ?? 'https://api.meta.ai/v1'
  const prompt = (payload.prompt ?? 'climbing holds').slice(0, 60)

  // SAM 3.1 runs over the Responses API with the model "sam-3.1".
  const body = {
    model: 'sam-3.1',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: payload.frame },
        ],
      },
    ],
  }

  let upstream: Response
  try {
    upstream = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return json({ error: 'upstream_unreachable', message: String(e) }, 502)
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return json({ error: 'upstream_error', status: upstream.status, detail: text.slice(0, 2000) }, 502)
  }

  const data = await upstream.json()
  // Frame dimensions are unknown server-side; boxes are returned normalised
  // where possible. Pass 1,1 so the pixel-heuristic leaves 0–1 values intact.
  const boxes = extractBoxes(data, 1, 1)

  return json({ holds: boxes, count: boxes.length })
}

export const config: Config = { path: '/api/holds' }
