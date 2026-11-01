/**
 * Hold-type metadata + a geometry-based type estimator.
 *
 * SAM 3.1 segments holds but does NOT classify them. We estimate the physical
 * hold type from the detected box's aspect ratio, size and orientation. This is
 * a heuristic (labelled "estimated" in the UI), not ground truth.
 *
 * Colours follow the common reference chart (jug=blue, crimp=green,
 * sloper=yellow, pinch=red, pocket=purple, edge=orange, …).
 */

import type { HoldType } from '../types'

export const HOLD_LABEL: Record<HoldType, string> = {
  jug: 'Jug',
  crimp: 'Crimp',
  sloper: 'Sloper',
  pinch: 'Pinch',
  pocket: 'Pocket',
  edge: 'Edge',
  sidepull: 'Sidepull',
  gaston: 'Gaston',
  undercling: 'Undercling',
  foothold: 'Foothold',
  volume: 'Volume',
  unknown: 'Hold',
}

/** Conventional colour per type (from the common climbing-hold chart). */
export const HOLD_COLOR: Record<HoldType, string> = {
  jug: '#2f72e0',
  crimp: '#4caf3f',
  sloper: '#e8c21f',
  pinch: '#d7372f',
  pocket: '#8b4fc4',
  edge: '#e8622a',
  sidepull: '#e8c21f',
  gaston: '#2f9e6e',
  undercling: '#8b4fc4',
  foothold: '#b03a3a',
  volume: '#3a6fd8',
  unknown: '#5b6480',
}

/** One-line description, used in tooltips/labels. */
export const HOLD_DESC: Record<HoldType, string> = {
  jug: 'Big, easy to grip',
  crimp: 'Small flat edge for fingertips',
  sloper: 'Rounded, held by friction',
  pinch: 'Squeeze between thumb and fingers',
  pocket: 'Hole for one or more fingers',
  edge: 'Thin horizontal ledge',
  sidepull: 'Vertical hold pulled sideways',
  gaston: 'Vertical hold pushed outward',
  undercling: 'Gripped from underneath',
  foothold: 'Small, for feet',
  volume: 'Large feature on the wall',
  unknown: 'Hold',
}

export interface BoxShape {
  /** normalised 0–1 */
  w: number
  h: number
}

/**
 * Estimate a hold type from the detected box geometry (normalised to frame).
 *
 * Rough rules of thumb:
 * - very small           → foothold
 * - large & roundish     → volume / sloper / jug (by size)
 * - wide & flat          → crimp (small) / edge (medium)
 * - tall & narrow        → sidepull / pinch
 * - near-square medium   → pocket / jug
 */
export function estimateHoldType(box: BoxShape): HoldType {
  const w = box.w
  const h = box.h
  const area = w * h
  const ar = w / Math.max(h, 1e-4) // >1 wide, <1 tall

  // Very small blobs are almost always footholds.
  if (area < 0.0025) return 'foothold'

  // Large features.
  if (area > 0.03) {
    if (ar > 0.75 && ar < 1.4) return 'volume'
    return ar >= 1.4 ? 'sloper' : 'jug'
  }

  // Wide & flat → crimp (small) or edge (bigger).
  if (ar >= 1.7) return area < 0.008 ? 'crimp' : 'edge'

  // Tall & narrow → sidepull / pinch.
  if (ar <= 0.6) return area < 0.008 ? 'pinch' : 'sidepull'

  // Near-square, medium → jug if sizeable, else pocket.
  if (area > 0.012) return 'jug'
  return 'pocket'
}
