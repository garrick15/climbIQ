import { buildDemoAnalysis } from '../data/demo'
import type { Analysis } from '../types'
import { estimatePose } from './pose-estimation'
import type { PoseTrack } from './pose-estimation'
import { analyseMovement } from './movement'
import { buildAnalysis } from './build-analysis'
import type { CoachOutput } from './build-analysis'
import { sampleFrames } from './frames'

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
}): Promise<AnalyseResult> {
  const { file, signal, onProgress, durationSec } = opts

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

    // Grab a few frames for visual grounding (optional; best-effort).
    let frames: string[] = []
    try {
      frames = await sampleFrames(file, 4, signal)
    } catch {
      frames = []
    }

    // Stage 3: AI coaching via the secure serverless proxy.
    onProgress({ stage: 3, fraction: 0.2 })
    const res = await fetch(COACH_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ observations: obs, frames, durationSec: obs.durationSec }),
      signal,
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (err.error === 'missing_api_key') {
        return fallback(
          'No Meta API key is configured yet, so this is sample coaching. Add META_API_KEY to enable real analysis.',
        )
      }
      return fallback(err.message || `Coaching service returned ${res.status}. Showing sample data.`)
    }

    const { analysis: coach } = (await res.json()) as { analysis: CoachOutput }
    onProgress({ stage: 3, fraction: 1 })

    return { analysis: buildAnalysis(coach, track, obs), poseTrack: track, usedFallback: false }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    return fallback(
      e instanceof Error ? `${e.message} Showing sample data instead.` : 'Analysis failed. Showing sample data.',
    )
  }
}
