import { buildDemoAnalysis } from '../data/demo'
import type { Analysis } from '../types'
import { estimatePose } from './pose-estimation'
import type { LiveFrame, PoseTrack } from './pose-estimation'
import { analyseMovement } from './movement'
import { buildAnalysis } from './build-analysis'
import { detectHolds } from './holds'
import type { HoldDetection } from './holds'

export interface PipelineStage {
  id: string
  label: string
  detail: string
}

/**
 * Real pipeline stages. Unlike the old simulated version, progress here is
 * driven by actual work (frame-by-frame pose estimation, then the AI call).
 */
export const PIPELINE: PipelineStage[] = [
  { id: 'read', label: 'Reading video', detail: 'Decoding frames in your browser' },
  { id: 'pose', label: 'Tracking body pose', detail: 'MediaPipe locating joints across the climb' },
  { id: 'moves', label: 'Measuring movement', detail: 'Joint angles, balance and move segmentation' },
  { id: 'holds', label: 'Detecting holds', detail: 'SAM 3.1 segmenting the wall (approximate)' },
  { id: 'coach', label: 'Writing your coaching', detail: 'Muse Spark interpreting the movement' },
]

export interface Progress {
  stage: number
  /** 0–1 within the current stage */
  fraction: number
}

export interface AnalyseResult {
  analysis: Analysis
  /** the real pose track, when one was produced (for the skeleton overlay) */
  poseTrack?: PoseTrack
  /** true when we had to fall back to labelled demo data */
  usedFallback: boolean
  /** human-readable reason, when a fallback happened */
  fallbackReason?: string
}

const COACH_ENDPOINT = '/api/coach'

/**
 * The real analysis pipeline:
 *   video → MediaPipe pose → movement observations → Muse Spark coaching → Analysis
 *
 * Any failure (no file, pose can't load, no person detected, API key missing,
 * network error) falls back to clearly-labelled demo data so the UI never
 * breaks — and we tell the caller why.
 */
export async function analyseClimb(opts: {
  file?: File
  durationSec?: number
  signal: AbortSignal
  onProgress: (p: Progress) => void
  /** live per-frame snapshots during pose estimation, for the processing view */
  onLiveFrame?: (f: LiveFrame) => void
}): Promise<AnalyseResult> {
  const { file, signal, onProgress, onLiveFrame, durationSec } = opts

  // No file → this is the "Try a sample climb" path. Honest demo data.
  if (!file) {
    onProgress({ stage: PIPELINE.length - 1, fraction: 1 })
    return { analysis: buildDemoAnalysis(durationSec), usedFallback: false }
  }

  const fallback = (reason: string): AnalyseResult => ({
    analysis: { ...buildDemoAnalysis(durationSec), source: 'demo' },
    usedFallback: true,
    fallbackReason: reason,
  })

  try {
    // Stage 0: decoding happens inside estimatePose; show it starting.
    onProgress({ stage: 0, fraction: 0.4 })

    // Stage 1: real pose estimation across sampled frames.
    const track = await estimatePose(file, {
      signal,
      sampleFps: 8,
      maxFrames: 160,
      onProgress: ({ done, total }) => {
        onProgress({ stage: 1, fraction: total ? done / total : 0 })
      },
      onFrame: onLiveFrame,
    })

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    // Stage 2: deterministic movement analysis.
    onProgress({ stage: 2, fraction: 0.3 })
    const obs = analyseMovement(track)
    if (!obs) {
      return fallback(
        'We could not track a climber clearly in this video. Try a clip filmed side-on with the whole body in frame.',
      )
    }
    onProgress({ stage: 2, fraction: 1 })

    // Stage 3: hold detection (SAM 3.1). Best-effort stretch feature — if it
    // finds nothing or isn't available, we continue with suggested targets.
    onProgress({ stage: 3, fraction: 0.2 })
    let detection: HoldDetection | null = null
    try {
      detection = await detectHolds(file, track, signal)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      detection = null
    }
    onProgress({ stage: 3, fraction: 1 })

    // Visual-grounding frames are OFF: images are the biggest driver of model
    // latency, and the pose/biomechanics observations already carry the signal.
    // Text-only keeps the coaching call inside the serverless time budget.
    const frames: string[] = []

    // A compact summary of detected holds so coaching can reference them.
    const holdSummary = detection
      ? {
          detected: true,
          count: detection.holds.length,
          positions: detection.holds.slice(0, 20).map((h) => ({
            id: h.id,
            x: Math.round((h.x / 360) * 100) / 100,
            y: Math.round((h.y / 540) * 100) / 100,
          })),
          note: 'Hold positions are normalised 0-1 (x: left→right, y: top→bottom). Approximate.',
        }
      : { detected: false, note: 'Holds not detected; suggest movement from body motion only.' }

    // Stage 4: AI coaching via the secure serverless proxy.
    onProgress({ stage: 4, fraction: 0.2 })
    const res = await fetch(COACH_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ observations: obs, holds: holdSummary, frames, durationSec: obs.durationSec }),
      signal,
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        status?: number
        detail?: string
      }
      // Log the full upstream detail so we can see exactly why Muse Spark failed.
      console.error('[ClimbIQ] /api/coach not OK:', res.status, err)
      if (err.error === 'missing_api_key') {
        return fallback(
          'No Meta API key is configured yet, so this is sample coaching. Add META_API_KEY to enable real analysis.',
        )
      }
      if (res.status === 504 || res.status === 502) {
        return fallback(
          'The coaching model took too long to respond (server timeout). Showing sample data — try a shorter clip.',
        )
      }
      if (res.status === 429) {
        return fallback('Too many analyses in a short time. Please wait a moment and try again.')
      }
      if (res.status === 413) {
        return fallback('This clip produced too much data to analyse. Try a shorter clip.')
      }
      const detail = err.detail ? ` Detail: ${String(err.detail).slice(0, 300)}` : ''
      const upstream = err.status ? ` (Meta API status ${err.status})` : ''
      return fallback(
        `${err.message || `Coaching service returned ${res.status}`}${upstream}.${detail} Showing sample data — see console.`,
      )
    }

    // Parse the coaching payload defensively: a non-OK body or an HTML error
    // page would otherwise throw here and be hidden as a generic failure.
    // buildAnalysis() normalises whatever shape the model returned, so we pass
    // the raw `analysis` through without asserting its structure here.
    let coachRaw: unknown
    try {
      const data = (await res.json()) as { analysis?: unknown }
      if (data.analysis == null) throw new Error('Coaching response had no "analysis" field.')
      coachRaw = data.analysis
    } catch (parseErr) {
      console.error('[ClimbIQ] Could not parse /api/coach response:', parseErr)
      return fallback('The coaching service returned an unexpected response. Showing sample data.')
    }
    onProgress({ stage: 4, fraction: 1 })

    return {
      analysis: buildAnalysis(coachRaw, track, obs, detection),
      poseTrack: track,
      usedFallback: false,
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    // Surface the real cause in the console so failures aren't silently hidden.
    console.error('[ClimbIQ] Analysis pipeline failed:', e)
    return fallback(
      e instanceof Error
        ? `${e.message} (Showing sample data — see the browser console for details.)`
        : 'Analysis failed. Showing sample data — see the browser console for details.',
    )
  }
}
