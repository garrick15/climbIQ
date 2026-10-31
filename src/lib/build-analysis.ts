/**
 * Assembles a full `Analysis` from:
 *   - the AI coaching JSON returned by the Muse Spark proxy (text + reasoning), and
 *   - the real MediaPipe pose track (measured limb positions).
 *
 * We do NOT detect holds (that is the SAM 3.1 stretch goal). So the Visual Beta
 * "holds" here are SUGGESTED TARGET POINTS placed at where the climber's hands
 * and feet actually were at each step — derived from real pose, labelled as
 * suggested, never presented as detected holds.
 */

import { LM } from './pose-estimation'
import type { PoseTrack } from './pose-estimation'
import type { MovementObservations } from './movement'
import type {
  Analysis,
  BetaStep,
  FeedbackItem,
  Hold,
  LimbState,
  Metric,
  TrainingFocus,
} from '../types'

/** The shape the serverless function returns (model output, pre-assembly). */
export interface CoachOutput {
  climb: { outcome: string; durationSec: number; moves: number; holdsDetected: number }
  metrics: Metric[]
  beta: Omit<BetaStep, 'limbs' | 'hipShift' | 'cue'>[]
  feedback: FeedbackItem[]
  training: TrainingFocus[]
}

const WALL_W = 340
const WALL_H = 560

/** Nearest sampled pose frame to a timestamp. */
function frameAt(track: PoseTrack, t: number) {
  let best = track.frames[0]
  let bestD = Infinity
  for (const f of track.frames) {
    if (!f.landmarks) continue
    const d = Math.abs(f.t - t)
    if (d < bestD) {
      bestD = d
      best = f
    }
  }
  return best.landmarks ? best : null
}

/**
 * Convert a normalised landmark (0–1 image space) into wall-canvas coordinates.
 * The pose is in the camera frame; we map it into the same coordinate box the
 * BetaWall renders in so the stick figure and target points line up.
 */
function toWall(x: number, y: number): { x: number; y: number } {
  return { x: x * WALL_W, y: y * WALL_H }
}

/**
 * Build a `LimbState` for a beta step from the real pose at that timestamp.
 * Each limb points at a free (suggested) position, not a detected hold id.
 */
function limbStateAt(track: PoseTrack, t: number): LimbState {
  const f = frameAt(track, t)
  if (!f || !f.landmarks) {
    // Fallback: a neutral stance if pose is missing at this instant.
    return {
      lh: { x: WALL_W * 0.38, y: WALL_H * 0.4 },
      rh: { x: WALL_W * 0.62, y: WALL_H * 0.4 },
      lf: { x: WALL_W * 0.42, y: WALL_H * 0.85 },
      rf: { x: WALL_W * 0.58, y: WALL_H * 0.85 },
    }
  }
  const p = f.landmarks
  return {
    lh: toWall(p[LM.leftWrist].x, p[LM.leftWrist].y),
    rh: toWall(p[LM.rightWrist].x, p[LM.rightWrist].y),
    lf: toWall(p[LM.leftAnkle].x, p[LM.leftAnkle].y),
    rf: toWall(p[LM.rightAnkle].x, p[LM.rightAnkle].y),
  }
}

/**
 * Suggested target holds: one marker per unique hand position across the beta.
 * These are placed at measured hand locations and labelled "suggested target",
 * NOT claimed to be detected wall holds.
 */
function suggestedHolds(beta: BetaStep[]): Hold[] {
  const holds: Hold[] = []
  let n = 0
  const seen: { x: number; y: number }[] = []
  for (const step of beta) {
    for (const key of ['lh', 'rh'] as const) {
      const t = step.limbs[key]
      if (typeof t === 'string') continue
      const dup = seen.some((s) => Math.hypot(s.x - t.x, s.y - t.y) < 24)
      if (dup) continue
      seen.push(t)
      holds.push({
        id: `sg-${n++}`,
        name: 'Suggested target',
        x: t.x,
        y: t.y,
        kind: step.id === beta[beta.length - 1]?.id ? 'finish' : 'hand',
        rx: 11,
        ry: 8,
        rot: 0,
      })
    }
  }
  return holds
}

const cueFor = (i: number): BetaStep['cue'] => ({
  text: '',
  side: i % 2 === 0 ? 'right' : 'left',
})

/** Assemble the UI-ready `Analysis` from model output + real pose. */
export function buildAnalysis(
  coach: CoachOutput,
  track: PoseTrack,
  obs: MovementObservations,
): Analysis {
  // Attach measured limb positions + a hip-shift proxy to each coaching step.
  const beta: BetaStep[] = coach.beta.map((s, i) => {
    const limbs = limbStateAt(track, s.timestamp)
    const f = frameAt(track, s.timestamp)
    let hipShift = 0
    if (f?.landmarks) {
      const p = f.landmarks
      const hipMid = (p[LM.leftHip].x + p[LM.rightHip].x) / 2
      const shoulderMid = (p[LM.leftShoulder].x + p[LM.rightShoulder].x) / 2
      hipShift = (hipMid - shoulderMid) * WALL_W
    }
    return {
      ...s,
      id: s.id || `step-${i + 1}`,
      limbs,
      hipShift,
      cue: cueFor(i),
    }
  })

  const holds = suggestedHolds(beta)

  return {
    source: 'ai',
    provenance: {
      poseDetectionRate: obs.detectionRate,
      framesSampled: obs.frameCount,
      holdsDetected: false,
      notes: obs.notes,
    },
    climb: {
      outcome: coach.climb.outcome,
      durationSec: coach.climb.durationSec || obs.durationSec,
      moves: beta.length,
      // Honest: we place suggested targets, we do not detect holds.
      holdsDetected: 0,
    },
    metrics: coach.metrics,
    holds,
    beta,
    feedback: coach.feedback,
    training: coach.training,
  }
}
