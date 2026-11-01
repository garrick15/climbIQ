/**
 * Lightweight abuse guard for the serverless endpoints — these spend a PAID
 * Meta API budget, so we cap who/how often/how big without a backend.
 *
 * Best-effort only:
 * - Rate limit is in-memory per function instance (resets on cold start and is
 *   not shared across instances). It deters casual scripting; it is not a
 *   hardened limiter. For production, back it with a shared store (Netlify
 *   Blobs / Upstash).
 * - Same-origin check blocks naive cross-site/curl usage via Origin/Referer.
 * - Size cap rejects oversized bodies before we forward them to the model.
 */

export interface GuardOptions {
  /** max requests per IP within the window */
  maxPerWindow?: number
  /** window length in ms */
  windowMs?: number
  /** max request body size in bytes */
  maxBodyBytes?: number
}

interface Bucket {
  count: number
  resetAt: number
}
const buckets = new Map<string, Bucket>()

function clientIp(req: Request): string {
  // Netlify forwards the real client IP in these headers.
  const xf = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')
  return (xf?.split(',')[0] || 'unknown').trim()
}

/** Is the request coming from our own site? (naive but effective) */
function sameOrigin(req: Request): boolean {
  const host = req.headers.get('host') || ''
  const origin = req.headers.get('origin') || ''
  const referer = req.headers.get('referer') || ''
  // Allow when there is no Origin/Referer only if it matches host via referer;
  // browsers always send Origin on cross-origin POSTs, so a missing Origin from
  // a same-site fetch is still fine. We reject only clearly foreign origins.
  const foreign = (val: string) => {
    if (!val) return false
    try {
      return new URL(val).host !== host
    } catch {
      return false
    }
  }
  if (foreign(origin) || foreign(referer)) return false
  return true
}

/**
 * Run the guard. Returns a `Response` to short-circuit with (429/413/403), or
 * `null` to proceed. Call after reading the raw body text.
 */
export function guard(req: Request, bodyText: string, opts: GuardOptions = {}): Response | null {
  const maxPerWindow = opts.maxPerWindow ?? 12
  const windowMs = opts.windowMs ?? 5 * 60_000
  const maxBodyBytes = opts.maxBodyBytes ?? 2 * 1024 * 1024 // 2 MB

  const deny = (status: number, error: string, message: string) =>
    new Response(JSON.stringify({ error, message }), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  // 1) Same-origin only.
  if (!sameOrigin(req)) {
    return deny(403, 'forbidden_origin', 'Requests must come from the ClimbIQ app.')
  }

  // 2) Body size cap.
  const size = new TextEncoder().encode(bodyText).length
  if (size > maxBodyBytes) {
    return deny(413, 'payload_too_large', `Request body is ${Math.round(size / 1024)} KB; the limit is ${Math.round(maxBodyBytes / 1024)} KB.`)
  }

  // 3) Per-IP rate limit (best-effort, in-memory).
  const ip = clientIp(req)
  const now = Date.now()
  const b = buckets.get(ip)
  if (!b || now > b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs })
  } else {
    b.count += 1
    if (b.count > maxPerWindow) {
      const retry = Math.ceil((b.resetAt - now) / 1000)
      return new Response(
        JSON.stringify({ error: 'rate_limited', message: `Too many analyses. Try again in ${retry}s.` }),
        { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(retry) } },
      )
    }
  }

  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
  }

  return null
}
