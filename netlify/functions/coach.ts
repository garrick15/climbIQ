/**
 * ClimbIQ — coaching serverless function (Netlify).
 *
 * This is the ONLY place the Meta Model API key is used. The browser posts
 * pose-derived observations (and optionally a few sampled frames) here; this
 * function forwards them to Muse Spark with the key attached server-side, then
 * returns structured coaching JSON. The frontend never sees the key.
 *
 * Modern Netlify function: a default export that receives a Web `Request` and
 * returns a Web `Response`. `netlify.toml` maps /api/coach → this function.
 */

import type { Config, Context } from '@netlify/functions'
import { guard } from './_guard'

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
- "moveSteps": 3-4 short ordered micro-steps to execute the move, e.g.
  ["Transfer weight to left foot","Rotate hips to the wall","Reach the target hold"].
- "attemptIssues": 1-2 short bullets on what the climber did wrong this move
  (empty array if the move was clean). "recommendedWins": 1-2 short bullets on what
  the recommended move does better.
- "coachNote": one friendly sentence of direct coaching for this move.
- "successRate": integer 0-100, your estimate that the recommended move succeeds.

FEEDBACK — keep it SHORT and ACTIONABLE. 3-5 items max. Each:
- "title": the verdict headline (e.g. "Drop your heel on the crux").
- "observation": ONE short sentence of what happened.
- "tryThis": ONE direct instruction to fix/keep it (always present for "improve").
- "why": ONE short sentence. "kind": "strength" or "improve". Include >=1 strength.
- "timestamp" + "skill". Do not pad. Prefer imperative voice ("Keep your hips in", not
  "The climber's hips drifted").

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
          moveSteps: { type: 'array', items: { type: 'string' } },
          attemptIssues: { type: 'array', items: { type: 'string' } },
          recommendedWins: { type: 'array', items: { type: 'string' } },
          coachNote: { type: 'string' },
          successRate: { type: 'number' },
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Parse the model's text output into JSON — robustly, and WITHOUT ever
 * throwing (a throw here would crash the function and surface as a 502).
 *
 * Handles: code fences, prose around the JSON, and TRUNCATED output (the
 * common failure when the response hits the token limit mid-array) by
 * balancing any unclosed strings/brackets before a final parse attempt.
 */
function parseModelJson(raw: string): unknown | null {
  if (!raw) return null
  // Strip ```json … ``` fences if present.
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

  const tryParse = (s: string): unknown | null => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }

  // 1) Straight parse.
  let out = tryParse(text)
  if (out) return out

  // 2) Slice to the outermost object braces.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    out = tryParse(text.slice(start, end + 1))
    if (out) return out
  }

  // 3) Repair truncated JSON: from the first '{', walk the string tracking
  //    nesting + string state, then append the missing closers.
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
    // Drop a dangling trailing comma before closing.
    repaired = repaired.replace(/,\s*$/, '')
    while (stack.length) repaired += stack.pop()
    out = tryParse(repaired)
    if (out) return out
  }

  return null
}

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed', message: 'Use POST.' }, 405)
  }

  const apiKey = process.env.META_API_KEY
  if (!apiKey) {
    return json(
      {
        error: 'missing_api_key',
        message:
          'META_API_KEY is not set. On Netlify, add it under Site settings → ' +
          'Environment variables, then redeploy. Locally, copy .env.example to ' +
          '.env.local and paste your Meta Model API key.',
      },
      501,
    )
  }

  // Read the raw body once so the guard can size-check before we parse.
  const bodyText = await req.text()

  // Abuse guard: same-origin, body-size cap, per-IP rate limit. This endpoint
  // spends a paid Meta API budget, so we gate it.
  const blocked = guard(req, bodyText, { maxPerWindow: 12, maxBodyBytes: 2 * 1024 * 1024 })
  if (blocked) return blocked

  let payload: CoachRequest
  try {
    payload = JSON.parse(bodyText) as CoachRequest
  } catch {
    return json({ error: 'invalid_json', message: 'Request body must be JSON.' }, 400)
  }
  if (!payload || typeof payload !== 'object' || !('observations' in payload)) {
    return json({ error: 'invalid_body', message: 'Expected JSON with an "observations" field.' }, 400)
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
  // Images are the biggest driver of model latency; only send a couple and
  // only if provided (the client omits them to stay within the time budget).
  for (const dataUrl of (payload.frames ?? []).slice(0, 2)) {
    content.push({ type: 'image_url', image_url: { url: dataUrl } })
  }

  // Build the request. `useSchema=false` drops response_format and relies on a
  // strong "return pure JSON" instruction instead — a compatibility fallback
  // for when strict json_schema is rejected upstream.
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
    // Keep reasoning light so the call returns within the function budget
    // (ignored by providers that don't support it).
    reasoning_effort: 'low',
    // Bounded so generation completes inside the ~26s sync-function ceiling;
    // the prompt keeps output concise so it isn't truncated.
    max_tokens: 3000,
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
      // Retry once without the structured response_format — the most common
      // reason a provider rejects an otherwise-valid chat request.
      firstErrorDetail = (await upstream.text().catch(() => '')).slice(0, 2000)
      console.warn('[coach] schema request failed, retrying without response_format:', upstream.status)
      upstream = await callUpstream(false)
    }
  } catch (e) {
    return json({ error: 'upstream_unreachable', message: String(e) }, 502)
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return json(
      {
        error: 'upstream_error',
        status: upstream.status,
        detail: (text || firstErrorDetail).slice(0, 2000),
        firstAttempt: firstErrorDetail ? firstErrorDetail.slice(0, 500) : undefined,
      },
      502,
    )
  }

  const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = data.choices?.[0]?.message?.content
  if (!raw) {
    return json({ error: 'empty_response', message: 'The model returned no content.' }, 502)
  }

  const analysis = parseModelJson(raw)
  if (!analysis) {
    // Never throw here — return a clean error so the function can't 502.
    return json(
      {
        error: 'unparseable_response',
        message: 'The model output was not valid JSON (often truncated output).',
        detail: raw.slice(0, 1500),
      },
      502,
    )
  }

  return json({ analysis })
}

// Route this function at /api/coach so the frontend's fetch('/api/coach') works.
export const config: Config = {
  path: '/api/coach',
}
