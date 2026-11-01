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
import { nearestHold } from './holds'
import type { HoldDetection } from './holds'
import { climberSummary } from './climberMetrics'
import type {
  Analysis,
  BetaStep,
  FeedbackItem,
  Hold,
  Limb,
  LimbState,
  LimbTarget,
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
 *
 * When detected holds are supplied, each limb is SNAPPED to the nearest
 * detected hold within tolerance (so the stick figure grabs real holds and the
 * beta can reference them). Limbs with no nearby hold keep their free,
 * pose-measured position. Without detection, every limb is a free position.
 */
function limbStateAt(track: PoseTrack, t: number, holds?: Hold[]): LimbState {
  const f = frameAt(track, t)
  if (!f || !f.landmarks) {
    return {
      lh: { x: WALL_W * 0.38, y: WALL_H * 0.4 },
      rh: { x: WALL_W * 0.62, y: WALL_H * 0.4 },
      lf: { x: WALL_W * 0.42, y: WALL_H * 0.85 },
      rf: { x: WALL_W * 0.58, y: WALL_H * 0.85 },
    }
  }
  const p = f.landmarks
  const raw: Record<Limb, { x: number; y: number }> = {
    lh: toWall(p[LM.leftWrist].x, p[LM.leftWrist].y),
    rh: toWall(p[LM.rightWrist].x, p[LM.rightWrist].y),
    lf: toWall(p[LM.leftAnkle].x, p[LM.leftAnkle].y),
    rf: toWall(p[LM.rightAnkle].x, p[LM.rightAnkle].y),
  }
  const snap = (limb: Limb): LimbTarget => {
    const pt = raw[limb]
    if (holds && holds.length) {
      // Hands reach a bit further to a hold than feet (smears are looser).
      const tol = limb.endsWith('h') ? 64 : 80
      const h = nearestHold(holds, pt.x, pt.y, tol)
      if (h) return h.id
    }
    return pt
  }
  return { lh: snap('lh'), rh: snap('rh'), lf: snap('lf'), rf: snap('rf') }
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

const cueFor = (i: number, title: string): BetaStep['cue'] => ({
  // Short cue shown by the hip marker; fall back to the move title.
  text: title.length <= 28 ? title : `${title.slice(0, 26)}…`,
  side: i % 2 === 0 ? 'right' : 'left',
})

/**
 * Mark hold kinds from how limbs use them across the beta:
 * - holds used by a hand → 'hand'; the highest such hold → 'finish'
 * - holds only used by a foot → 'foot'
 * - detected holds never grabbed → 'off' (detected but off the suggested line)
 */
function classifyHolds(holds: Hold[], beta: BetaStep[]): Hold[] {
  const handIds = new Set<string>()
  const footIds = new Set<string>()
  for (const step of beta) {
    for (const l of ['lh', 'rh', 'lf', 'rf'] as Limb[]) {
      const t = step.limbs[l]
      if (typeof t !== 'string') continue
      if (l.endsWith('h')) handIds.add(t)
      else footIds.add(t)
    }
  }
  // Highest (smallest y) hand hold is the finish.
  let finishId: string | null = null
  let finishY = Infinity
  for (const h of holds) {
    if (handIds.has(h.id) && h.y < finishY) {
      finishY = h.y
      finishId = h.id
    }
  }
  return holds.map((h) => {
    let kind = h.kind
    if (h.id === finishId) kind = 'finish'
    else if (handIds.has(h.id)) kind = 'hand'
    else if (footIds.has(h.id)) kind = 'foot'
    else kind = 'off'
    return { ...h, kind }
  })
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const asNum = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const asStr = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

/**
 * Normalise the model's output into a guaranteed-complete CoachOutput.
 * The model can omit fields, rename them, or return the wrong type (especially
 * when strict schema is dropped on the retry path). We coerce everything so the
 * pipeline and UI never read `.length`/`.map` on undefined.
 */
function normaliseCoach(raw: unknown, obs: MovementObservations): CoachOutput {
  const c = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>
  const climb = (c.climb && typeof c.climb === 'object' ? (c.climb as Record<string, unknown>) : {}) as Record<string, unknown>

  const MOVE_LIMBS = ['lh', 'rh', 'lf', 'rf']
  const RATINGS = ['best', 'good', 'inaccuracy', 'mistake']
  const beta = asArray<Record<string, unknown>>(c.beta).map((s, i) => ({
    id: asStr(s.id) || `step-${i + 1}`,
    title: asStr(s.title, `Move ${i + 1}`),
    summary: asStr(s.summary) || asStr(s.instruction),
    bodyPosition: asStr(s.bodyPosition),
    why: asStr(s.why) || asStr(s.reason),
    yourAttempt: asStr(s.yourAttempt),
    timestamp: asNum(s.timestamp, (i / Math.max(1, asArray(c.beta).length)) * obs.durationSec),
    crux: typeof s.crux === 'boolean' ? s.crux : undefined,
    // chess.com-style coaching fields
    instruction: asStr(s.instruction) || asStr(s.summary),
    moveLimb: MOVE_LIMBS.includes(asStr(s.moveLimb)) ? (asStr(s.moveLimb) as 'lh' | 'rh' | 'lf' | 'rf') : undefined,
    rating: RATINGS.includes(asStr(s.rating)) ? (asStr(s.rating) as 'best' | 'good' | 'inaccuracy' | 'mistake') : undefined,
    reason: asStr(s.reason) || asStr(s.why),
    // rich coach-panel fields (with safe fallbacks so the panel is never empty)
    moveSteps: asArray<unknown>(s.moveSteps)
      .map((x) => (typeof x === 'string' ? x : ''))
      .filter(Boolean),
    attemptIssues: asArray<unknown>(s.attemptIssues)
      .map((x) => (typeof x === 'string' ? x : ''))
      .filter(Boolean),
    recommendedWins: asArray<unknown>(s.recommendedWins)
      .map((x) => (typeof x === 'string' ? x : ''))
      .filter(Boolean),
    coachNote: asStr(s.coachNote) || asStr(s.yourAttempt),
    successRate: Number.isFinite(asNum(s.successRate, NaN))
      ? Math.round(Math.min(100, Math.max(0, asNum(s.successRate, 0))))
      : undefined,
  }))

  // The model sometimes names these fields differently (name/score/…), so
  // accept common aliases and parse numeric strings like "72" or "72%".
  const firstStr = (...vals: unknown[]): string => {
    for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim()
    return ''
  }
  const firstNum = (...vals: unknown[]): number => {
    for (const v of vals) {
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string') {
        const parsed = parseFloat(v.replace(/[^0-9.\-]/g, ''))
        if (Number.isFinite(parsed)) return parsed
      }
    }
    return NaN
  }
  const metrics = asArray<Record<string, unknown>>(c.metrics).map((m, i) => {
    const raw = firstNum(m.value, m.score, m.rating, m.percent, m.val)
    // Some models return 0–1 instead of 0–100.
    const scaled = Number.isFinite(raw) ? (raw > 0 && raw <= 1 ? raw * 100 : raw) : 0
    return {
      id: asStr(m.id) || `m-${i}`,
      label: firstStr(m.label, m.name, m.title, m.skill, m.metric) || `Metric ${i + 1}`,
      value: Math.round(Math.min(100, Math.max(0, scaled))),
      note: firstStr(m.note, m.detail, m.description, m.comment),
    }
  })

  const feedback = asArray<Record<string, unknown>>(c.feedback)
    .map((f, i) => ({
      id: asStr(f.id) || `fb-${i}`,
      kind: f.kind === 'strength' ? ('strength' as const) : ('improve' as const),
      timestamp: asNum(f.timestamp, 0),
      title: asStr(f.title),
      observation: asStr(f.observation),
      why: asStr(f.why),
      tryThis: typeof f.tryThis === 'string' ? f.tryThis : undefined,
      skill: asStr(f.skill, 'General'),
      stepId: typeof f.stepId === 'string' ? f.stepId : undefined,
    }))
    // Drop empty/blank items so the UI never shows a hollow "Note / Why it matters:".
    .filter((f) => f.title.trim() || f.observation.trim())
    .map((f) => ({ ...f, title: f.title || 'Observation' }))

  const training = asArray<Record<string, unknown>>(c.training).map((t, i) => ({
    id: asStr(t.id) || `tr-${i}`,
    rank: asNum(t.rank, i + 1),
    skill: asStr(t.skill, 'Technique'),
    headline: asStr(t.headline, asStr(t.skill, 'Focus')),
    reason: asStr(t.reason),
    impact: t.impact === 'High' ? ('High' as const) : ('Medium' as const),
    impactScore: Math.min(100, Math.max(0, asNum(t.impactScore, 60))),
    cue: asStr(t.cue),
    cadence: asStr(t.cadence, '2 sessions a week'),
    evidence: asArray<Record<string, unknown>>(t.evidence).map((e) => ({
      timestamp: asNum(e.timestamp, 0),
      label: asStr(e.label, 'See clip'),
    })),
    drills: asArray<Record<string, unknown>>(t.drills).map((d) => ({
      name: asStr(d.name, 'Drill'),
      prescription: asStr(d.prescription),
      detail: asStr(d.detail),
    })),
  }))

  return {
    climb: {
      outcome: asStr(climb.outcome, 'Attempt analysed'),
      durationSec: asNum(climb.durationSec, obs.durationSec),
      moves: asNum(climb.moves, beta.length),
      holdsDetected: asNum(climb.holdsDetected, 0),
    },
    metrics,
    beta,
    feedback,
    training,
  }
}

/** Assemble the UI-ready `Analysis` from model output + real pose (+ optional holds). */
export function buildAnalysis(
  rawCoach: unknown,
  track: PoseTrack,
  obs: MovementObservations,
  detection?: HoldDetection | null,
): Analysis {
  // Coerce the model output into a complete, well-typed shape first.
  const coach = normaliseCoach(rawCoach, obs)

  const detectedHolds = detection?.holds
  const hasDetection = !!detectedHolds && detectedHolds.length > 0

  // If the model gave us no beta at all, synthesise one step per detected move
  // so the Visual Beta is never empty (uses the real pose + move timings).
  const betaSource =
    coach.beta.length > 0
      ? coach.beta
      : obs.moves.map((m, i) => ({
          id: `step-${i + 1}`,
          title: `Move ${i + 1}`,
          summary: 'Suggested from your movement. The coach did not return a description for this move.',
          bodyPosition: '',
          why: '',
          yourAttempt: '',
          timestamp: m.startT,
          crux: undefined,
        }))

  // Attach measured limb positions (snapped to detected holds when available)
  // + a hip-shift proxy to each coaching step.
  const beta: BetaStep[] = betaSource.map((s, i) => {
    const limbs = limbStateAt(track, s.timestamp, detectedHolds)
    const f = frameAt(track, s.timestamp)
    let hipShift = 0
    if (f?.landmarks) {
      const p = f.landmarks
      const hipMid = (p[LM.leftHip].x + p[LM.rightHip].x) / 2
      const shoulderMid = (p[LM.leftShoulder].x + p[LM.rightShoulder].x) / 2
      hipShift = (hipMid - shoulderMid) * WALL_W
    }
    return { ...s, id: s.id || `step-${i + 1}`, limbs, hipShift, cue: cueFor(i, s.title) }
  })

  // The Visual Beta reads beta[stepIndex]; never let it be empty.
  if (beta.length === 0) {
    beta.push({
      id: 'step-1',
      title: 'Your attempt',
      summary: 'We tracked your body but could not segment distinct moves on this clip.',
      bodyPosition: '',
      why: '',
      yourAttempt: '',
      timestamp: 0,
      limbs: limbStateAt(track, obs.durationSec / 2, detectedHolds),
      hipShift: 0,
      cue: cueFor(0, 'Your attempt'),
    })
  }

  // Holds: real detected holds (classified by use) when we have them;
  // otherwise suggested target points from measured hand positions.
  const holds = hasDetection ? classifyHolds(detectedHolds, beta) : suggestedHolds(beta)

  const notes = [...obs.notes]
  if (hasDetection) {
    notes.unshift(
      `Holds detected with SAM 3.1 (approximate): ${holds.filter((h) => h.kind !== 'off').length} on the suggested line of ${holds.length} found.`,
    )
  }

  return {
    source: 'ai',
    provenance: {
      poseDetectionRate: obs.detectionRate,
      framesSampled: obs.frameCount,
      holdsDetected: hasDetection,
      notes,
    },
    climb: {
      outcome: coach.climb.outcome,
      durationSec: coach.climb.durationSec || obs.durationSec,
      moves: beta.length,
      holdsDetected: hasDetection ? holds.length : 0,
    },
    metrics: coach.metrics,
    climberStats: climberSummary(obs.biomechanics, obs.detectionRate),
    holds,
    beta,
    // Guarantee the Feedback tab is never empty: if the model returned no
    // feedback (e.g. truncated output), derive honest items from the measured
    // biomechanics so the climber always gets actionable notes.
    feedback: coach.feedback.length > 0 ? coach.feedback : feedbackFromBiomechanics(obs),
    training: coach.training,
  }
}

/**
 * Fallback feedback derived purely from measured biomechanics — used only when
 * the AI returns none. Honest (based on real numbers), direct, and actionable.
 */
function feedbackFromBiomechanics(obs: MovementObservations): FeedbackItem[] {
  const bio = obs.biomechanics
  const out: FeedbackItem[] = []
  const mid = obs.durationSec / 2

  // Arm efficiency: lots of bent-arm time = pumped forearms.
  if (obs.angleSummary.bentArmFraction > 0.4) {
    out.push({
      id: 'bm-arms',
      kind: 'improve',
      timestamp: mid,
      title: 'Hang off straighter arms',
      observation: 'You spent much of the climb with bent arms.',
      why: 'Bent arms keep your forearms working and pump you out faster.',
      tryThis: 'Between moves, drop your shoulders and let your arms go straight to rest.',
      skill: 'Arm efficiency',
    })
  }

  // Stability: weight off the base of support.
  if (bio.comOutsideFraction > 0.4) {
    out.push({
      id: 'bm-balance',
      kind: 'improve',
      timestamp: mid,
      title: 'Keep weight over your feet',
      observation: 'Your centre of mass drifted off your base of support on several moves.',
      why: 'When your weight is off your feet you swing and pull harder with your arms.',
      tryThis: 'Set your feet and shift your hips over them before reaching.',
      skill: 'Balance',
    })
  }

  // Smoothness: lots of pauses / jerky movement.
  if (obs.pauses.length >= 2) {
    out.push({
      id: 'bm-flow',
      kind: 'improve',
      timestamp: obs.pauses[0]?.startT ?? mid,
      title: 'Climb more continuously',
      observation: `You paused ${obs.pauses.length} times mid-route.`,
      why: 'Long pauses on bad holds drain energy. Keep momentum between rests.',
      tryThis: 'Plan two or three moves ahead so you flow between good holds.',
      skill: 'Movement fluency',
    })
  }

  // A genuine strength so it's not all criticism.
  if (bio.comOutsideFraction <= 0.4) {
    out.push({
      id: 'bm-strength',
      kind: 'strength',
      timestamp: mid,
      title: 'Balanced over your feet',
      observation: 'You kept your weight over your base for most of the climb.',
      why: 'That saves grip strength and makes reaches feel easier.',
      skill: 'Balance',
    })
  }

  // Always return at least one item.
  if (out.length === 0) {
    out.push({
      id: 'bm-general',
      kind: 'strength',
      timestamp: mid,
      title: 'Solid, controlled climbing',
      observation: 'No major efficiency issues stood out in the movement data.',
      why: 'Clean movement is the foundation to build harder climbing on.',
      skill: 'Overall',
    })
  }
  return out
}
