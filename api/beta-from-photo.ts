/**
 * ClimbIQ — suggested beta from a wall photo (Vercel).
 * Mirror of netlify/functions/beta-from-photo.ts. Model: muse-spark (multimodal).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

const SYSTEM_PROMPT = `You are ClimbIQ, an expert bouldering coach. You are given a SINGLE PHOTO of a
bouldering wall and a planned route: an ordered list of holds (normalised x/y positions, an
estimated hold type, and a colour) from bottom to top. No climber is in the photo.

Produce a SUGGESTED beta: how to climb this route. Rules:
- This is a suggestion from one 2D photo; reach and feasibility are estimated. Never claim it
  is the only or guaranteed sequence.
- Give ONE beta step per hold in the route order. For each: a short "title", a "summary"
  (which hand/foot goes where and how), a "bodyPosition", and a "why".
- Use the hold types to inform technique (e.g. open-hand on a sloper, thumb-pinch on a pinch,
  high feet before a long reach).
- Add 3 "metrics" (0-100) describing the route's suggested demands, each with a short note.
- Never return empty strings; give concrete climbing coaching.

Return ONLY valid JSON: {"beta":[{id,title,summary,bodyPosition,why}],"metrics":[{id,label,value,note}]}.`

function parseModelJson(raw: string): unknown | null {
  if (!raw) return null
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const tryParse = (s: string): unknown | null => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }
  let out = tryParse(text)
  if (out) return out
  const start = text.indexOf('{')
  if (start >= 0) {
    const body = text.slice(start)
    const stack: string[] = []
    let inStr = false
    let esc = false
    let repaired = ''
    for (const ch of body) {
      repaired += ch
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if (ch === '}' || ch === ']') stack.pop()
    }
    if (inStr) repaired += '"'
    repaired = repaired.replace(/,\s*$/, '')
    while (stack.length) repaired += stack.pop()
    out = tryParse(repaired)
    if (out) return out
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  const apiKey = process.env.META_API_KEY
  if (!apiKey) {
    res.status(501).json({ error: 'missing_api_key', message: 'META_API_KEY is not set.' })
    return
  }
  const payload = req.body as { route?: unknown; routeColor?: string; frame?: string }
  if (!Array.isArray(payload?.route) || payload.route.length < 2) {
    res.status(400).json({ error: 'invalid_body', message: 'Expected a "route" array of >= 2 holds.' })
    return
  }

  const baseUrl = process.env.META_API_BASE_URL ?? 'https://api.meta.ai/v1'
  const model = process.env.META_MODEL ?? 'muse-spark-1.3'

  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text:
        (payload.routeColor ? `Route colour: ${payload.routeColor}.\n` : '') +
        `Planned route (bottom to top), normalised 0-1 positions:\n` +
        '```json\n' +
        JSON.stringify(payload.route, null, 2) +
        '\n```\n\nProduce the suggested beta JSON for this route.',
    },
  ]
  if (typeof payload.frame === 'string') {
    content.push({ type: 'image_url', image_url: { url: payload.frame } })
  }

  const buildBody = (useSchema: boolean) => ({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    temperature: 0.5,
    max_tokens: 6000,
    ...(useSchema ? { response_format: { type: 'json_object' } } : {}),
  })

  const call = (useSchema: boolean) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(buildBody(useSchema)),
    })

  let upstream: Response
  try {
    upstream = await call(true)
    if (!upstream.ok) upstream = await call(false)
  } catch (e) {
    res.status(502).json({ error: 'upstream_unreachable', message: String(e) })
    return
  }
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    res.status(502).json({ error: 'upstream_error', status: upstream.status, detail: text.slice(0, 1500) })
    return
  }

  const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = data.choices?.[0]?.message?.content ?? ''
  const analysis = parseModelJson(raw)
  if (!analysis) {
    res.status(502).json({ error: 'unparseable_response', detail: raw.slice(0, 1200) })
    return
  }
  res.status(200).json({ analysis })
}
