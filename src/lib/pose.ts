import type { Hold, Limb, LimbState, LimbTarget, Point } from '../types'

export interface Pose {
  head: Point
  ls: Point
  rs: Point
  le: Point
  re: Point
  lhip: Point
  rhip: Point
  lk: Point
  rk: Point
  lh: Point
  rh: Point
  lf: Point
  rf: Point
  hip: Point
}

export const LIMBS: Limb[] = ['lh', 'rh', 'lf', 'rf']

export const LIMB_LABEL: Record<Limb, string> = {
  lh: 'LH',
  rh: 'RH',
  lf: 'LF',
  rf: 'RF',
}

export const LIMB_NAME: Record<Limb, string> = {
  lh: 'Left hand',
  rh: 'Right hand',
  lf: 'Left foot',
  rf: 'Right foot',
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export function holdMap(holds: Hold[]): Map<string, Hold> {
  return new Map(holds.map((h) => [h.id, h]))
}

export function resolveTarget(target: LimbTarget, map: Map<string, Hold>): Point {
  if (typeof target === 'string') {
    const h = map.get(target)
    if (!h) throw new Error(`Unknown hold: ${target}`)
    return { x: h.x, y: h.y }
  }
  return target
}

/**
 * Two-bone limb: given root and end, find the joint (elbow/knee).
 * The joint bends outward (away from body centre) when there is slack.
 */
function joint(root: Point, end: Point, segment: number, outward: 1 | -1): Point {
  const m = mid(root, end)
  const dx = end.x - root.x
  const dy = end.y - root.y
  const d = Math.hypot(dx, dy) || 1
  const slack = Math.max(0, segment * segment - (d / 2) * (d / 2))
  const h = Math.sqrt(slack)
  // two perpendiculars; choose the one that points outward in x
  let nx = -dy / d
  let ny = dx / d
  if (nx * outward < 0) {
    nx = -nx
    ny = -ny
  }
  return { x: m.x + nx * h, y: m.y + ny * h }
}

/** Build a stylised stick-figure pose from the four limb contact points. */
export function buildPose(limbs: LimbState, holds: Hold[], hipShift = 0): Pose {
  const map = holdMap(holds)
  const lh = resolveTarget(limbs.lh, map)
  const rh = resolveTarget(limbs.rh, map)
  const lf = resolveTarget(limbs.lf, map)
  const rf = resolveTarget(limbs.rf, map)

  const handsMid = mid(lh, rh)
  const feetMid = mid(lf, rf)

  const hip: Point = {
    x: (handsMid.x + feetMid.x) / 2 + hipShift,
    y: handsMid.y * 0.45 + feetMid.y * 0.55,
  }
  const shoulderC: Point = { x: hip.x * 0.6 + handsMid.x * 0.4, y: hip.y - 56 }

  const ls = { x: shoulderC.x - 18, y: shoulderC.y }
  const rs = { x: shoulderC.x + 18, y: shoulderC.y }
  const lhip = { x: hip.x - 11, y: hip.y }
  const rhip = { x: hip.x + 11, y: hip.y }

  return {
    head: { x: shoulderC.x, y: shoulderC.y - 30 },
    ls,
    rs,
    lhip,
    rhip,
    le: joint(ls, lh, 46, -1),
    re: joint(rs, rh, 46, 1),
    lk: joint(lhip, lf, 54, -1),
    rk: joint(rhip, rf, 54, 1),
    lh,
    rh,
    lf,
    rf,
    hip,
  }
}

/** Limbs whose contact changed between two states. */
export function movedLimbs(prev: LimbState | undefined, next: LimbState): Limb[] {
  if (!prev) return []
  return LIMBS.filter((l) => JSON.stringify(prev[l]) !== JSON.stringify(next[l]))
}

/** Curved path between two points, shortened at both ends so arrowheads clear the holds. */
export function arcPath(a: Point, b: Point, bow = 0.18, startGap = 12, endGap = 15): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  const s = { x: a.x + ux * startGap, y: a.y + uy * startGap }
  const e = { x: b.x - ux * endGap, y: b.y - uy * endGap }
  const cx = (s.x + e.x) / 2 - dy * bow
  const cy = (s.y + e.y) / 2 + dx * bow
  return `M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`
}
