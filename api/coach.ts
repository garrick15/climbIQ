/**
 * ClimbIQ — coaching serverless function (Vercel Node.js runtime).
 *
 * This is the ONLY place the Meta Model API key is used. The browser posts
 * pose-derived observations (and optionally a few sampled frames) here; this
 * function forwards them to Muse Spark with the key attached server-side, then
 * returns structured coaching JSON.
 *
 * The frontend never sees the key. Do not move this logic into the client.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface CoachRequest {
  /** Measurable, pose-derived facts produced in the browser by MediaPipe. */
  observations: unknown
  /** Detected holds summary from SAM 3.1 (approximate), or {detected:false}. */
  holds?: unknown
  /** Optional base64 data URLs of a few sampled frames for visual grounding. */
  frames?: string[]
  /** Clip length in seconds, so timestamps land inside the video. */
  durationSec?: number
}

const SYSTEM_PROMPT = `You are ClimbIQ, an expert bouldering coach analysing a single recorded attempt.

You receive MEASURED, pose-derived observations extracted in the browser with MediaPipe:
joint angles, limb trajectories, an approximate 2D centre-of-mass path, move segmentation,
pauses, and a biomechanics summary (COM sway/RMS jerk for smoothness, torso inclination,
left-right asymmetry, stability as COM-vs-support, angular velocity, foot-movement flags).
You may also get a few sampled video frames and, when available, detected hold positions.

You are a COACH, not a motion detector. Think like chess.com's move analysis: for each move,
give a clear verdict, the single best thing to do, and the reason — in plain climber language.

Follow these rules:
- Ground claims in the supplied observations/holds/frames. Don't invent holds, colours or grades.
- Treat centre of mass as an APPROXIMATE 2D estimate. Beta is SUGGESTED, not guaranteed.
- Write like you're talking to the climber mid-session: direct, confident, concrete. No jargon
  dumps, no raw numbers in the text.

BETA — one step per detected move, in order. For EACH step provide:
- "instruction": ONE clear directive naming the limb and target, e.g.
  "Right hand up to the sloper" or "Left foot onto the high chip". Prefer a hold name/type
  when holds are detected (e.g. "to the blue crimp"); otherwise describe the direction
  ("up and left to the next hold").
- "moveLimb": which limb moves — one of "lh","rh","lf","rf".
- "rating": how the climber executed THIS move — "best" | "good" | "inaccuracy" | "mistake".
- "reason": ONE sentence on why this move/way is right (the coaching insight).
- "title": 2-4 word label. "summary": the instruction expanded to one sentence.
- "bodyPosition" and "why": short and practical. "timestamp": seconds.

FEEDBACK — keep it SHORT and ACTIONABLE. 3-5 items max. Each:
- "title": the verdict headline (e.g. "Drop your heel on the crux").
- "observation": ONE short sentence of what happened.
- "tryThis": ONE direct instruction to fix/keep it (always present for "improve").
- "why": ONE short sentence. "kind": "strength" or "improve". Include >=1 strength.
- "timestamp" + "skill". Prefer imperative voice ("Keep your hips in").

metrics: EXACTLY 3-4 items, each an object with "label" (a skill name like
"Movement fluency", "Body positioning", "Footwork", "Arm efficiency"), "value" (an
INTEGER 0-100 scoring that skill on this climb), and "note" (one short sentence).
Use those exact keys. Never leave value as 0 unless the climb truly warrants it.
Never return empty strings. Be specific and useful over verbose.

Return ONLY valid JSON matching the provided schema. No prose outside the JSON.`

// JSON schema the model must fill. Mirrors the `Analysis` shape the UI renders.
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['climb', 'metrics', 'beta', 'feedback', 'training'],
  properties: {
    climb: {
      type: 'object',
      additionalProperties: false,
      required: ['outcome', 'durationSec', 'moves', 'holdsDetected'],
      properties: {
        outcome: { type: 'string' },
        durationSec: { type: 'number' },
        moves: { type: 'integer' },
        holdsDetected: { type: 'integer' },
      },
    },
    metrics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'value', 'note'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          value: { type: 'number' },
          note: { type: 'string' },
        },
      },
    },
    beta: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'instruction', 'moveLimb', 'rating', 'reason', 'summary', 'timestamp'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          instruction: { type: 'string' },
          moveLimb: { type: 'string', enum: ['lh', 'rh', 'lf', 'rf'] },
          rating: { type: 'string', enum: ['best', 'good', 'inaccuracy', 'mistake'] },
          reason: { type: 'string' },
          summary: { type: 'string' },
          bodyPosition: { type: 'string' },
          why: { type: 'string' },
          yourAttempt: { type: 'string' },
          timestamp: { type: 'number' },
          crux: { type: 'boolean' },
        },
      },
    },
    feedback: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'timestamp', 'title', 'observation', 'why', 'skill'],
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['strength', 'improve'] },
          timestamp: { type: 'number' },
          title: { type: 'string' },
          observation: { type: 'string' },
          why: { type: 'string' },
          tryThis: { type: 'string' },
          skill: { type: 'string' },
        },
      },
    },
    training: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'rank', 'skill', 'headline', 'reason', 'impact', 'impactScore', 'cue', 'cadence', 'drills'],
        properties: {
          id: { type: 'string' },
          rank: { type: 'integer' },
          skill: { type: 'string' },
          headline: { type: 'string' },
          reason: { type: 'string' },
          impact: { type: 'string', enum: ['High', 'Medium'] },
          impactScore: { type: 'number' },
          cue: { type: 'string' },
          cadence: { type: 'string' },
          drills: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'prescription', 'detail'],
              properties: {
                name: { type: 'string' },
                prescription: { type: 'string' },
                detail: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const

/**
 * Parse model text output to JSON robustly, without throwing. Handles code
 * fences, surrounding prose, and TRUNCATED output (balances unclosed
 * strings/brackets) — truncation is the common cause of the parse crash.
 */
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
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    out = tryParse(text.slice(start, end + 1))
    if (out) return out
  }
  if (start >= 0) {
    const body = text.slice(start)
    const stack: string[] = []
    let inStr = false
    let escaped = false
    let repaired = ''
    for (const ch of body) {
      repaired += ch
      if (inStr) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
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
    res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' })
    return
  }

  const apiKey = process.env.META_API_KEY
  if (!apiKey) {
    // Clear, actionable error — this is what shows if the key hasn't been set.
    res.status(501).json({
      error: 'missing_api_key',
      message:
        'META_API_KEY is not set. Copy .env.example to .env.local and paste your Meta Model API key, ' +
        'or add META_API_KEY in Vercel → Settings → Environment Variables.',
    })
    return
  }

  const payload = req.body as CoachRequest
  if (!payload || typeof payload !== 'object' || !('observations' in payload)) {
    res.status(400).json({ error: 'invalid_body', message: 'Expected JSON with an "observations" field.' })
    return
  }

  const baseUrl = process.env.META_API_BASE_URL ?? 'https://api.meta.ai/v1'
  const model = process.env.META_MODEL ?? 'muse-spark-1.3'

  // Build the multimodal user message: observations as text + optional frames.
  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text:
        `Clip length: ${payload.durationSec ?? 'unknown'} seconds.\n\n` +
        `Pose-derived observations (measured in-browser by MediaPipe):\n` +
        '```json\n' +
        JSON.stringify(payload.observations, null, 2) +
        '\n```\n\n' +
        `Detected holds (Meta SAM 3.1, approximate):\n` +
        '```json\n' +
        JSON.stringify(payload.holds ?? { detected: false }, null, 2) +
        '\n```\n\n' +
        'When holds are detected, reference them in your beta (e.g. which hold a ' +
        'hand/foot should move to, using the normalised positions) and keep moves ' +
        'consistent with where the climber actually was. When holds are NOT detected, ' +
        'suggest movement from body motion only and do not invent specific holds.\n\n' +
        'Produce the coaching JSON for this attempt.',
    },
  ]
  for (const dataUrl of (payload.frames ?? []).slice(0, 6)) {
    content.push({ type: 'image_url', image_url: { url: dataUrl } })
  }

  const buildBody = (useSchema: boolean) => ({
    model,
    messages: [
      {
        role: 'system',
        content: useSchema
          ? SYSTEM_PROMPT
          : `${SYSTEM_PROMPT}\n\nOutput ONLY a single JSON object with keys: climb, metrics, beta, feedback, training. No markdown, no code fences, no prose.`,
      },
      { role: 'user', content },
    ],
    temperature: 0.4,
    // Large: the full analysis is long; too small truncates the JSON.
    max_tokens: 8000,
    ...(useSchema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'climb_analysis', strict: true, schema: RESPONSE_SCHEMA },
          },
        }
      : {}),
  })

  const callUpstream = (useSchema: boolean) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(buildBody(useSchema)),
    })

  let upstream: Response
  let firstErrorDetail = ''
  try {
    upstream = await callUpstream(true)
    if (!upstream.ok) {
      firstErrorDetail = (await upstream.text().catch(() => '')).slice(0, 2000)
      console.warn('[coach] schema request failed, retrying without response_format:', upstream.status)
      upstream = await callUpstream(false)
    }
  } catch (e) {
    res.status(502).json({ error: 'upstream_unreachable', message: String(e) })
    return
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    res.status(502).json({
      error: 'upstream_error',
      status: upstream.status,
      detail: (text || firstErrorDetail).slice(0, 2000),
      firstAttempt: firstErrorDetail ? firstErrorDetail.slice(0, 500) : undefined,
    })
    return
  }

  const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = data.choices?.[0]?.message?.content
  if (!raw) {
    res.status(502).json({ error: 'empty_response', message: 'The model returned no content.' })
    return
  }

  const analysis = parseModelJson(raw)
  if (!analysis) {
    // Never throw — return a clean error so the function can't 502.
    res.status(502).json({
      error: 'unparseable_response',
      message: 'The model output was not valid JSON (often truncated output).',
      detail: raw.slice(0, 1500),
    })
    return
  }

  res.status(200).json({ analysis })
}
