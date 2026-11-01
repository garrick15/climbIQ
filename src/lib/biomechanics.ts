/**
 * Biomechanics — per-frame and per-sequence climbing metrics from MediaPipe
 * landmarks. Deterministic, honest measurement (Muse Spark interprets, it does
 * not measure). All positions are normalised image space (0–1).
 *
 * These are 2D approximations from a single camera. Per the product rules:
 * - Centre of mass is an APPROXIMATE 2D estimate.
 * - Stability (COM-vs-support) is a simplified indicator, not a definitive
 *   climbing-stability measurement.
 * - Asymmetry is reported, never auto-labelled as "wrong".
 * - Foot movement while weighted is flagged, not called "slipping".
 *
 * Formula references map to the spec items (1–19) in comments.
 */

import { LM } from './pose-estimation'
import type { PoseFrame, PoseTrack } from './pose-estimation'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export interface Vec {
  x: number
  y: number
}

/** Anthropometric body-segment mass fractions (de Leva / Winter, 2D subset). */
const SEGMENT_MASS = {
  headTrunk: 0.578, // head + trunk
  upperArm: 0.028,
  forearmHand: 0.022,
  thigh: 0.1,
  shankFoot: 0.061,
} as const

const v = (p: NormalizedLandmark): Vec => ({ x: p.x, y: p.y })
const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Angle at vertex b formed by b→a and b→c (deg). Spec #3. */
function angle3(a: Vec, b: Vec, c: Vec): number {
  const ba = { x: a.x - b.x, y: a.y - b.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }
  const dot = ba.x * bc.x + ba.y * bc.y
  const m = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y)
  if (m === 0) return NaN
  return (Math.acos(Math.min(1, Math.max(-1, dot / m))) * 180) / Math.PI
}

/** Wrap an angle to (-180, 180]. */
const wrap = (deg: number): number => {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

export interface JointAnglesFull {
  leftElbow: number
  rightElbow: number
  leftShoulder: number
  rightShoulder: number
  leftHip: number
  rightHip: number
  leftKnee: number
  rightKnee: number
}

export interface BioFrame {
  t: number
  /** spec #1: COM, both approximations (advanced uses segment masses) */
  com: Vec | null
  comSimple: Vec | null
  /** spec #2: torso inclination from vertical, degrees */
  torsoInclination: number | null
  /** spec #3 */
  angles: JointAnglesFull | null
  /** spec #4 */
  armExtensionL: number | null
  armExtensionR: number | null
  /** spec #5 */
  legExtensionL: number | null
  legExtensionR: number | null
  /** spec #7: support triangle area (best 3 contact points) */
  supportArea: number | null
  /** spec #8: signed COM-to-support distance (+inside, -outside) */
  comSupport: { dist: number; inside: boolean } | null
  /** spec #10: |L-R| joint-angle asymmetry */
  asymmetry: { elbow: number; shoulder: number; hip: number; knee: number } | null
  /** spec #12: hip rotation = shoulder-line orient - hip-line orient (deg) */
  hipRotation: number | null
  /** raw contact points for velocity/sway computation downstream */
  pts: {
    lh: Vec
    rh: Vec
    lf: Vec
    rf: Vec
  } | null
}

/** Spec #1 advanced COM: mass-weighted segment midpoints. */
function computeCOM(p: NormalizedLandmark[]): Vec {
  const ls = v(p[LM.leftShoulder])
  const rs = v(p[LM.rightShoulder])
  const lh = v(p[LM.leftHip])
  const rh = v(p[LM.rightHip])
  const le = v(p[LM.leftElbow])
  const re = v(p[LM.rightElbow])
  const lw = v(p[LM.leftWrist])
  const rw = v(p[LM.rightWrist])
  const lk = v(p[LM.leftKnee])
  const rk = v(p[LM.rightKnee])
  const la = v(p[LM.leftAnkle])
  const ra = v(p[LM.rightAnkle])

  const trunk = mid(mid(ls, rs), mid(lh, rh))
  const segs: [Vec, number][] = [
    [trunk, SEGMENT_MASS.headTrunk],
    [mid(ls, le), SEGMENT_MASS.upperArm],
    [mid(rs, re), SEGMENT_MASS.upperArm],
    [mid(le, lw), SEGMENT_MASS.forearmHand],
    [mid(re, rw), SEGMENT_MASS.forearmHand],
    [mid(lh, lk), SEGMENT_MASS.thigh],
    [mid(rh, rk), SEGMENT_MASS.thigh],
    [mid(lk, la), SEGMENT_MASS.shankFoot],
    [mid(rk, ra), SEGMENT_MASS.shankFoot],
  ]
  let sx = 0
  let sy = 0
  let sm = 0
  for (const [pt, m] of segs) {
    sx += pt.x * m
    sy += pt.y * m
    sm += m
  }
  return { x: sx / sm, y: sy / sm }
}

/** Spec #7: triangle area from three points. */
function triArea(a: Vec, b: Vec, c: Vec): number {
  return 0.5 * Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y))
}

/** Point-in-triangle test (barycentric) for spec #8. */
function pointInTri(pt: Vec, a: Vec, b: Vec, c: Vec): boolean {
  const d = (p1: Vec, p2: Vec, p3: Vec) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
  const d1 = d(pt, a, b)
  const d2 = d(pt, b, c)
  const d3 = d(pt, c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/** Shortest distance from point to a segment. */
function distToSeg(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby || 1e-9
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * abx, y: a.y + t * aby })
}

/** Compute all per-frame biomechanics from one pose frame. */
export function bioFrame(f: PoseFrame): BioFrame {
  if (!f.landmarks) {
    return {
      t: f.t,
      com: null,
      comSimple: null,
      torsoInclination: null,
      angles: null,
      armExtensionL: null,
      armExtensionR: null,
      legExtensionL: null,
      legExtensionR: null,
      supportArea: null,
      comSupport: null,
      asymmetry: null,
      hipRotation: null,
      pts: null,
    }
  }
  const p = f.landmarks
  const ls = v(p[LM.leftShoulder])
  const rs = v(p[LM.rightShoulder])
  const lh = v(p[LM.leftHip])
  const rh = v(p[LM.rightHip])
  const le = v(p[LM.leftElbow])
  const re = v(p[LM.rightElbow])
  const lw = v(p[LM.leftWrist])
  const rw = v(p[LM.rightWrist])
  const lk = v(p[LM.leftKnee])
  const rk = v(p[LM.rightKnee])
  const la = v(p[LM.leftAnkle])
  const ra = v(p[LM.rightAnkle])

  const shoulderMid = mid(ls, rs)
  const hipMid = mid(lh, rh)

  // #1 COM
  const com = computeCOM(p)
  const comSimple = hipMid

  // #2 torso inclination from vertical (0 = upright)
  const torsoInclination = wrap(
    (Math.atan2(shoulderMid.y - hipMid.y, shoulderMid.x - hipMid.x) * 180) / Math.PI + 90,
  )

  // #3 joint angles
  const angles: JointAnglesFull = {
    leftElbow: angle3(ls, le, lw),
    rightElbow: angle3(rs, re, rw),
    leftShoulder: angle3(le, ls, lh),
    rightShoulder: angle3(re, rs, rh),
    leftHip: angle3(ls, lh, lk),
    rightHip: angle3(rs, rh, rk),
    leftKnee: angle3(lh, lk, la),
    rightKnee: angle3(rh, rk, ra),
  }

  // #4 arm extension ratio: wrist distance / (upper arm + forearm)
  const armLenL = dist(ls, le) + dist(le, lw) || 1e-6
  const armLenR = dist(rs, re) + dist(re, rw) || 1e-6
  const armExtensionL = dist(ls, lw) / armLenL
  const armExtensionR = dist(rs, rw) / armLenR

  // #5 leg extension ratio
  const legLenL = dist(lh, lk) + dist(lk, la) || 1e-6
  const legLenR = dist(rh, rk) + dist(rk, ra) || 1e-6
  const legExtensionL = dist(lh, la) / legLenL
  const legExtensionR = dist(rh, ra) / legLenR

  // #7/#8 support polygon: pick the 3 contact points (of 2 hands + 2 feet)
  // that form the largest triangle — the current base of support.
  const contacts: Vec[] = [lw, rw, la, ra]
  let bestArea = 0
  let bestTri: [Vec, Vec, Vec] | null = null
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      for (let k = j + 1; k < 4; k++) {
        const area = triArea(contacts[i], contacts[j], contacts[k])
        if (area > bestArea) {
          bestArea = area
          bestTri = [contacts[i], contacts[j], contacts[k]]
        }
      }
  let comSupport: { dist: number; inside: boolean } | null = null
  if (bestTri) {
    const inside = pointInTri(com, bestTri[0], bestTri[1], bestTri[2])
    const edgeDist = Math.min(
      distToSeg(com, bestTri[0], bestTri[1]),
      distToSeg(com, bestTri[1], bestTri[2]),
      distToSeg(com, bestTri[2], bestTri[0]),
    )
    comSupport = { dist: inside ? edgeDist : -edgeDist, inside }
  }

  // #10 asymmetry
  const asym = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : NaN)
  const asymmetry = {
    elbow: asym(angles.leftElbow, angles.rightElbow),
    shoulder: asym(angles.leftShoulder, angles.rightShoulder),
    hip: asym(angles.leftHip, angles.rightHip),
    knee: asym(angles.leftKnee, angles.rightKnee),
  }

  // #12 hip rotation = shoulder-line orientation - hip-line orientation
  const shoulderOrient = (Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180) / Math.PI
  const hipOrient = (Math.atan2(rh.y - lh.y, rh.x - lh.x) * 180) / Math.PI
  const hipRotation = wrap(shoulderOrient - hipOrient)

  return {
    t: f.t,
    com,
    comSimple,
    torsoInclination,
    angles,
    armExtensionL,
    armExtensionR,
    legExtensionL,
    legExtensionR,
    supportArea: bestArea,
    comSupport,
    asymmetry,
    hipRotation,
    pts: { lh: lw, rh: rw, lf: la, rf: ra },
  }
}

const rms = (xs: number[]): number => (xs.length ? Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / xs.length) : 0)
const meanOf = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

export interface BioSummary {
  /** #9 RMS COM sway over the whole climb (normalised units) */
  rmsSway: number
  maxSwing: number
  /** #13 mean COM speed (units/s) */
  meanComSpeed: number
  /** #14 RMS jerk of COM (smoothness; lower = smoother) */
  rmsJerk: number
  /** #16/#17 torso angular velocity/acceleration RMS (deg/s, deg/s²) */
  rmsAngularVelocity: number
  /** mean |L-R| asymmetry per joint, degrees */
  asymmetry: { elbow: number; shoulder: number; hip: number; knee: number }
  /** mean torso inclination from vertical, degrees */
  meanTorsoInclination: number
  /** fraction of frames with COM outside the support polygon (#8) */
  comOutsideFraction: number
  /** #19 count of frames where a weighted foot moved unexpectedly */
  footSlipFlags: number
}

/** Sequence-level biomechanics (#9, #13–#19). */
export function bioSummary(track: PoseTrack): { frames: BioFrame[]; summary: BioSummary } {
  const frames = track.frames.map(bioFrame)
  const valid = frames.filter((b) => b.com)

  // #9 sway + #13 speed + #14 jerk (COM derivatives)
  const swayDeltas: number[] = []
  const speeds: number[] = []
  const times: number[] = []
  const comX: number[] = []
  const comY: number[] = []
  let maxSwing = 0
  const com0 = valid[0]?.com
  for (let i = 0; i < valid.length; i++) {
    const c = valid[i].com!
    comX.push(c.x)
    comY.push(c.y)
    times.push(valid[i].t)
    if (com0) maxSwing = Math.max(maxSwing, dist(c, com0)) // #18 swing displacement
    if (i > 0) {
      const prev = valid[i - 1].com!
      const dt = valid[i].t - valid[i - 1].t || 1e-3
      swayDeltas.push(dist(c, prev))
      speeds.push(dist(c, prev) / dt)
    }
  }

  // derivatives for jerk (#14): velocity -> acceleration -> jerk
  const deriv = (xs: number[]) => {
    const out: number[] = []
    for (let i = 1; i < xs.length; i++) {
      const dt = times[i] - times[i - 1] || 1e-3
      out.push((xs[i] - xs[i - 1]) / dt)
    }
    return out
  }
  const vx = deriv(comX)
  const vy = deriv(comY)
  const ax = deriv(vx)
  const ay = deriv(vy)
  const jx = deriv(ax)
  const jy = deriv(ay)
  const jerkMag = jx.map((_, i) => Math.hypot(jx[i], jy[i] ?? 0))

  // #16/#17 torso angular velocity
  const torso = valid.map((b) => b.torsoInclination ?? NaN).filter(Number.isFinite)
  const angVel = deriv(torso)

  // #10 mean asymmetry
  const asymMean = (key: 'elbow' | 'shoulder' | 'hip' | 'knee') =>
    meanOf(valid.map((b) => b.asymmetry?.[key] ?? NaN).filter(Number.isFinite))

  // #8 COM outside support
  const withSupport = valid.filter((b) => b.comSupport)
  const outside = withSupport.filter((b) => !b.comSupport!.inside).length
  const comOutsideFraction = withSupport.length ? outside / withSupport.length : 0

  // #19 foot movement while weighted: a foot moves notably while the OTHER
  // foot + both hands are comparatively still (so this foot was load-bearing).
  let footSlipFlags = 0
  for (let i = 1; i < valid.length; i++) {
    const a = valid[i - 1].pts
    const b = valid[i].pts
    if (!a || !b) continue
    const dLF = dist(a.lf, b.lf)
    const dRF = dist(a.rf, b.rf)
    const dHands = (dist(a.lh, b.lh) + dist(a.rh, b.rh)) / 2
    const MOVE = 0.03
    if (dLF > MOVE && dRF < MOVE * 0.5 && dHands < MOVE * 0.5) footSlipFlags++
    else if (dRF > MOVE && dLF < MOVE * 0.5 && dHands < MOVE * 0.5) footSlipFlags++
  }

  const summary: BioSummary = {
    rmsSway: rms(swayDeltas),
    maxSwing,
    meanComSpeed: meanOf(speeds),
    rmsJerk: rms(jerkMag),
    rmsAngularVelocity: rms(angVel),
    asymmetry: {
      elbow: asymMean('elbow'),
      shoulder: asymMean('shoulder'),
      hip: asymMean('hip'),
      knee: asymMean('knee'),
    },
    meanTorsoInclination: meanOf(valid.map((b) => b.torsoInclination ?? NaN).filter(Number.isFinite)),
    comOutsideFraction,
    footSlipFlags,
  }

  return { frames, summary }
}
