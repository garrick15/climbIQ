/**
 * ClimbIQ — suggested beta from a wall photo (Netlify).
 *
 * Input: a planned route (ordered hold positions/types/colours from a single
 * photo) and the photo itself. Output: beta coaching text per move, from Muse
 * Spark. There is NO climber here, so this is a SUGGESTED sequence only.
 *
 * Uses the shared server-side META_API_KEY. Model: muse-spark (multimodal).
 */

import type { Config, Context } from '@netlify/functions'

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
- Add 3 "metrics" (0-100) describing the route's suggested demands, e.g. "Reach", "Balance",
  "Grip strength", each with a short note.
- Never return empty strings; give concrete climbing coaching.

Return ONLY valid JSON: {"beta":[{id,title,summary,bodyPosition,why}],"metrics":[{id,label,value,note}]}.`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

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

export default async function handler(req: Request, _ctx: Context): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = process.env.META_API_KEY
  if (!apiKey) return json({ error: 'missing_api_key', message: 'META_API_KEY is not set.' }, 501)

  let payload: { route?: unknown; routeColor?: string; frame?: string }
  try {
    payload = (await req.json()) as typeof payload
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!Array.isArray(payload.route) || payload.route.length < 2) {
    return json({ error: 'invalid_body', message: 'Expected a "route" array of >= 2 holds.' }, 400)
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
    return json({ error: 'upstream_unreachable', message: String(e) }, 502)
  }
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return json({ error: 'upstream_error', status: upstream.status, detail: text.slice(0, 1500) }, 502)
  }

  const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = data.choices?.[0]?.message?.content ?? ''
  const analysis = parseModelJson(raw)
  if (!analysis) return json({ error: 'unparseable_response', detail: raw.slice(0, 1200) }, 502)

  return json({ analysis })
}

export const config: Config = { path: '/api/beta-from-photo' }
