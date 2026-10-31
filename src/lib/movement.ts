/**
 * Movement analysis — turns a raw MediaPipe pose track into measurable,
 * numeric observations. This is deterministic TypeScript, no AI involved.
 *
 * Muse Spark later INTERPRETS these numbers into coaching; it does not
 * measure them. Keeping measurement here (honest, reproducible) and
 * interpretation in the model matches the intended architecture.
 *
 * All positions are in normalised image space (0–1). The centre of mass is an
 * APPROXIMATE 2D estimate from hips/shoulders — not a true biomechanical COM.
 */

import { LM } from './pose-estimation'
import type { PoseFrame, PoseTrack } from './pose-estimation'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export interface JointAngles {
  /** interior angle at the elbow, degrees (180 = straight arm) */
  leftElbow: number
  rightElbow: number
  /** interior angle at the knee, degrees (180 = straight leg) */
  leftKnee: number
  rightKnee: number
}

export interface FrameMetrics {
  t: number
  /** approximate 2D centre of mass, normalised image coords */
  com: { x: number; y: number } | null
  angles: JointAngles | null
  /** horizontal distance of hips from mean wall plane proxy (shoulders x) */
  hipDeviation: number | null
}

export interface MoveSegment {
  index: number
  startT: number
  endT: number
  /** which limbs moved most during this segment */
  movedLimbs: ('lh' | 'rh' | 'lf' | 'rf')[]
  /** peak COM speed during the segment (normalised units / second) */
  peakSpeed: number
}

export interface PauseEvent {
  startT: number
  endT: number
  durationSec: number
}

export interface MovementObservations {
  durationSec: number
  frameCount: number
  detectionRate: number
  /** mean/min joint angles across the climb */
  angleSummary: {
    meanLeftElbow: number
    meanRightElbow: number
    minLeftElbow: number
    minRightElbow: number
    meanLeftKnee: number
    meanRightKnee: number
    /** % of frames with at least one arm bent past 90° */
    bentArmFraction: number
  }
  /** approximate COM travel + how smooth the ascent was */
  comPath: {
    totalVerticalRise: number
    meanSpeed: number
    speedVariability: number
    /** net horizontal sway of COM (wall-in vs wall-out proxy) */
    horizontalSway: number
  }
  moves: MoveSegment[]
  pauses: PauseEvent[]
  /** per-frame series, downsampled for the model prompt */
  samples: FrameMetrics[]
  notes: string[]
}

const LIMB_KEYS = ['lh', 'rh', 'lf', 'rf'] as const
type LimbKey = (typeof LIMB_KEYS)[number]

const LIMB_LANDMARK: Record<LimbKey, number> = {
  lh: LM.leftWrist,
  rh: LM.rightWrist,
  lf: LM.leftAnkle,
  rf: LM.rightAnkle,
}

function angleAt(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
  // angle at b formed by segments b→a and b→c
  const v1x = a.x - b.x
  const v1y = a.y - b.y
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const dot = v1x * v2x + v1y * v2y
  const m1 = Math.hypot(v1x, v1y)
  const m2 = Math.hypot(v2x, v2y)
  if (m1 === 0 || m2 === 0) return Number.NaN
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)))
  return (Math.acos(cos) * 180) / Math.PI
}

function frameMetrics(f: PoseFrame): FrameMetrics {
  if (!f.landmarks) return { t: f.t, com: null, angles: null, hipDeviation: null }
  const p = f.landmarks

  const ls = p[LM.leftShoulder]
  const rs = p[LM.rightShoulder]
  const lh = p[LM.leftHip]
  const rh = p[LM.rightHip]

  // Approximate 2D COM: weighted toward the pelvis, nudged by the shoulders.
  const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 }
  const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }
  const com = {
    x: hipMid.x * 0.65 + shoulderMid.x * 0.35,
    y: hipMid.y * 0.6 + shoulderMid.y * 0.4,
  }

  const angles: JointAngles = {
    leftElbow: angleAt(p[LM.leftShoulder], p[LM.leftElbow], p[LM.leftWrist]),
    rightElbow: angleAt(p[LM.rightShoulder], p[LM.rightElbow], p[LM.rightWrist]),
    leftKnee: angleAt(p[LM.leftHip], p[LM.leftKnee], p[LM.leftAnkle]),
    rightKnee: angleAt(p[LM.rightHip], p[LM.rightKnee], p[LM.rightAnkle]),
  }

  // Hip deviation proxy: horizontal offset of hips from shoulders (body sag/out).
  const hipDeviation = hipMid.x - shoulderMid.x

  return { t: f.t, com, angles, hipDeviation }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN)
const round = (n: number, d = 3) => {
  const k = 10 ** d
  return Math.round(n * k) / k
}

/** Detect the limb that moved most between two frames, if any crossed a threshold. */
function limbMovement(a: PoseFrame, b: PoseFrame): Record<LimbKey, number> {
  const out = { lh: 0, rh: 0, lf: 0, rf: 0 } as Record<LimbKey, number>
  if (!a.landmarks || !b.landmarks) return out
  for (const k of LIMB_KEYS) {
    const i = LIMB_LANDMARK[k]
    out[k] = Math.hypot(b.landmarks[i].x - a.landmarks[i].x, b.landmarks[i].y - a.landmarks[i].y)
  }
  return out
}

/**
 * Analyse a pose track into observations. Returns null if too few frames had a
 * detected person for the analysis to be meaningful (caller falls back to demo).
 */
export function analyseMovement(track: PoseTrack): MovementObservations | null {
  const metrics = track.frames.map(frameMetrics)
  const valid = metrics.filter((m) => m.com && m.angles)
  if (valid.length < 4 || track.detectionRate < 0.35) return null

  const duration = track.frames[track.frames.length - 1].t

  // ── Joint-angle summary ──────────────────────────────────────────────
  const le = valid.map((m) => m.angles!.leftElbow).filter(Number.isFinite)
  const re = valid.map((m) => m.angles!.rightElbow).filter(Number.isFinite)
  const lk = valid.map((m) => m.angles!.leftKnee).filter(Number.isFinite)
  const rk = valid.map((m) => m.angles!.rightKnee).filter(Number.isFinite)
  const bentArmFrames = valid.filter(
    (m) => m.angles!.leftElbow < 90 || m.angles!.rightElbow < 90,
  ).length

  // ── COM path: speed series, rise, sway ───────────────────────────────
  const speeds: number[] = []
  let totalRise = 0
  let sway = 0
  for (let i = 1; i < valid.length; i++) {
    const dt = valid[i].t - valid[i - 1].t || 1e-3
    const dx = valid[i].com!.x - valid[i - 1].com!.x
    const dy = valid[i].com!.y - valid[i - 1].com!.y
    speeds.push(Math.hypot(dx, dy) / dt)
    // image y grows downward; upward climbing = decreasing y
    if (dy < 0) totalRise += -dy
    sway += Math.abs(dx)
  }
  const meanSpeed = mean(speeds)
  const speedSd = Math.sqrt(mean(speeds.map((s) => (s - meanSpeed) ** 2)) || 0)

  // ── Pause detection: stretches where COM speed stays low ─────────────
  const pauses: PauseEvent[] = []
  const PAUSE_SPEED = meanSpeed * 0.3
  let runStart = -1
  for (let i = 0; i < speeds.length; i++) {
    const slow = speeds[i] < PAUSE_SPEED
    if (slow && runStart < 0) runStart = i
    if ((!slow || i === speeds.length - 1) && runStart >= 0) {
      const startT = valid[runStart].t
      const endT = valid[i].t
      if (endT - startT >= 1.2) pauses.push({ startT: round(startT, 1), endT: round(endT, 1), durationSec: round(endT - startT, 1) })
      runStart = -1
    }
  }

  // ── Move segmentation: split at local peaks in limb movement ─────────
  // Work on the detected frames only, keeping a parallel array so limb
  // displacement is measured between consecutive *valid* frames.
  const validFrames = track.frames.filter((f) => f.landmarks)
  const moves: MoveSegment[] = []
  const movementSeries = validFrames.map((f, i) =>
    i === 0 ? { lh: 0, rh: 0, lf: 0, rf: 0 } : limbMovement(validFrames[i - 1], f),
  )
  const totalMove = movementSeries.map((m) => m.lh + m.rh + m.lf + m.rf)
  const moveThresh = mean(totalMove) * 1.1
  let segStart = 0
  let segPeak = 0
  let accum = { lh: 0, rh: 0, lf: 0, rf: 0 } as Record<LimbKey, number>
  for (let i = 1; i < valid.length; i++) {
    for (const k of LIMB_KEYS) accum[k] += movementSeries[i][k]
    segPeak = Math.max(segPeak, speeds[i - 1] ?? 0)
    const quiet = totalMove[i] < moveThresh * 0.4
    const long = valid[i].t - valid[segStart].t > 1.5
    if ((quiet && long) || i === valid.length - 1) {
      const movedLimbs = LIMB_KEYS.filter((k) => accum[k] > moveThresh * 0.5)
      moves.push({
        index: moves.length,
        startT: round(valid[segStart].t, 1),
        endT: round(valid[i].t, 1),
        movedLimbs,
        peakSpeed: round(segPeak, 3),
      })
      segStart = i
      segPeak = 0
      accum = { lh: 0, rh: 0, lf: 0, rf: 0 }
    }
  }

  // ── Downsample per-frame series for the prompt (≤ 40 points) ─────────
  const stride = Math.max(1, Math.ceil(valid.length / 40))
  const samples = valid
    .filter((_, i) => i % stride === 0)
    .map((m) => ({
      t: round(m.t, 2),
      com: m.com ? { x: round(m.com.x), y: round(m.com.y) } : null,
      angles: m.angles
        ? {
            leftElbow: round(m.angles.leftElbow, 1),
            rightElbow: round(m.angles.rightElbow, 1),
            leftKnee: round(m.angles.leftKnee, 1),
            rightKnee: round(m.angles.rightKnee, 1),
          }
        : null,
      hipDeviation: m.hipDeviation == null ? null : round(m.hipDeviation),
    }))

  const notes: string[] = []
  if (track.detectionRate < 0.7) {
    notes.push(
      `Body detected in ${Math.round(track.detectionRate * 100)}% of sampled frames; parts of the climb may be occluded or out of frame.`,
    )
  }
  notes.push('Centre of mass is an approximate 2D estimate from hips and shoulders.')
  notes.push('Hold positions are not detected; beta is suggested from body movement only.')

  return {
    durationSec: round(duration, 1),
    frameCount: track.frames.length,
    detectionRate: round(track.detectionRate, 2),
    angleSummary: {
      meanLeftElbow: round(mean(le), 1),
      meanRightElbow: round(mean(re), 1),
      minLeftElbow: round(Math.min(...le), 1),
      minRightElbow: round(Math.min(...re), 1),
      meanLeftKnee: round(mean(lk), 1),
      meanRightKnee: round(mean(rk), 1),
      bentArmFraction: round(bentArmFrames / valid.length, 2),
    },
    comPath: {
      totalVerticalRise: round(totalRise, 3),
      meanSpeed: round(meanSpeed, 3),
      speedVariability: round(speedSd, 3),
      horizontalSway: round(sway, 3),
    },
    moves,
    pauses,
    samples,
    notes,
  }
}
