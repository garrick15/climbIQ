import { buildDemoAnalysis } from '../data/demo'
import type { Analysis } from '../types'

export interface PipelineStage {
  id: string
  label: string
  detail: string
  /** simulated duration in ms */
  ms: number
}

export const PIPELINE: PipelineStage[] = [
  { id: 'read', label: 'Reading video', detail: 'Checking resolution and frame rate', ms: 900 },
  { id: 'pose', label: 'Tracking body pose', detail: 'Locating joints across the climb', ms: 1900 },
  { id: 'holds', label: 'Detecting holds', detail: 'Mapping the wall and the route', ms: 1600 },
  { id: 'moves', label: 'Segmenting moves', detail: 'Splitting the climb into single moves', ms: 1300 },
  { id: 'coach', label: 'Writing your coaching', detail: 'Linking observations to timestamps', ms: 1500 },
]

export interface Progress {
  stage: number
  /** 0–1 within the current stage */
  fraction: number
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

/**
 * The seam where the real computer-vision pipeline plugs in.
 * Today it only simulates progress and returns sample data.
 */
export async function analyseClimb(opts: {
  file?: File
  durationSec?: number
  signal: AbortSignal
  onProgress: (p: Progress) => void
}): Promise<Analysis> {
  const { signal, onProgress, durationSec } = opts
  const TICK = 70

  for (let stage = 0; stage < PIPELINE.length; stage++) {
    const { ms } = PIPELINE[stage]
    const ticks = Math.max(1, Math.round(ms / TICK))
    for (let i = 0; i <= ticks; i++) {
      onProgress({ stage, fraction: i / ticks })
      if (i < ticks) await sleep(TICK, signal)
    }
  }

  return buildDemoAnalysis(durationSec)
}
