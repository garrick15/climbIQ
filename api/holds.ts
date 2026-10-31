/**
 * ClimbIQ — climbing-hold detection via Meta SAM 3.1 (Vercel).
 * Mirror of netlify/functions/holds.ts for the Vercel runtime.
 * See that file for detailed notes. Model: sam-3.1 on the Responses API.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface DetectedBox {
  x: number
  y: number
  w: number
  h: number
  score?: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function extractBoxes(payload: unknown, frameW: number, frameH: number): DetectedBox[] {
  const out: DetectedBox[] = []
  const pushBox = (x: number, y: number, w: number, h: number, score?: number) => {
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
    const box = (o.box ?? o.bbox ?? o.bounding_box) as unknown
    if (Array.isArray(box) && box.length === 4 && box.every((n) => typeof n === 'number')) {
      const [a, b, c, d] = box as number[]
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' })
    return
  }
  const apiKey = process.env.META_API_KEY
  if (!apiKey) {
    res.status(501).json({ error: 'missing_api_key', message: 'META_API_KEY is not set.' })
    return
  }
  const payload = req.body as { frame?: string; prompt?: string }
  if (!payload?.frame) {
    res.status(400).json({ error: 'invalid_body', message: 'Expected a "frame" data URL.' })
    return
  }

  const baseUrl = process.env.META_API_BASE_URL ?? 'https://api.meta.ai/v1'
  const prompt = (payload.prompt ?? 'climbing holds').slice(0, 60)

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
    res.status(502).json({ error: 'upstream_unreachable', message: String(e) })
    return
  }
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    res.status(502).json({ error: 'upstream_error', status: upstream.status, detail: text.slice(0, 2000) })
    return
  }

  const data = await upstream.json()
  const boxes = extractBoxes(data, 1, 1)
  res.status(200).json({ holds: boxes, count: boxes.length })
}
