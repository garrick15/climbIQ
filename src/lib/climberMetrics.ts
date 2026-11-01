/**
 * Translate raw biomechanics into climber-friendly readouts.
 *
 * Climbers don't think in "RMS jerk" or "COM-to-support distance". This maps
 * the measured numbers into four things a climber understands:
 *   - Confidence  (how sure the tracking is — honesty about the data)
 *   - Stability   (how settled over the base of support)
 *   - Centre of mass (where their weight is, in words)
 *   - Balance / movement (smooth & balanced vs swinging / off-balance)
 *
 * Everything is phrased as guidance, with honest hedging.
 */

import type { BioSummary } from './biomechanics'
import type { BioFrame } from './biomechanics'
import type { ClimberStat } from '../types'

export type Level = ClimberStat['level']
export type { ClimberStat }

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Whole-climb climber-facing summary (used in the Feedback phase). */
export function climberSummary(bio: BioSummary, detectionRate: number): ClimberStat[] {
  // Confidence: how much of the climb we tracked cleanly.
  const confLevel: Level = detectionRate > 0.75 ? 'good' : detectionRate > 0.5 ? 'ok' : 'warn'

  // Stability: fraction of the climb with weight over the base of support.
  const overBase = 1 - bio.comOutsideFraction
  const stabLevel: Level = overBase > 0.75 ? 'good' : overBase > 0.55 ? 'ok' : 'warn'

  // Balance / movement: low sway + low jerk = smooth & controlled.
  // Thresholds are tuned for normalised image units; these are relative guides.
  const swingy = bio.rmsSway > 0.02 || bio.rmsJerk > 1.2
  const balLevel: Level = !swingy ? 'good' : bio.rmsSway > 0.035 || bio.rmsJerk > 2 ? 'warn' : 'ok'

  // Body position: torso close to upright over feet vs leaning/hanging back.
  const tilt = Math.abs(bio.meanTorsoInclination)
  const posLevel: Level = tilt < 18 ? 'good' : tilt < 32 ? 'ok' : 'warn'

  return [
    {
      id: 'confidence',
      label: 'Tracking confidence',
      value: pct(detectionRate),
      level: confLevel,
      hint:
        confLevel === 'good'
          ? 'We saw you clearly for most of the climb.'
          : confLevel === 'ok'
            ? 'Parts of the climb were hard to see — read the feedback as a guide.'
            : 'You were often out of frame or occluded; results are rough.',
    },
    {
      id: 'stability',
      label: 'Stability',
      value: overBase > 0.75 ? 'Settled' : overBase > 0.55 ? 'Mixed' : 'Off-base',
      level: stabLevel,
      hint:
        stabLevel === 'good'
          ? 'Your weight stayed over your feet — a strong, restful position.'
          : stabLevel === 'ok'
            ? 'You drifted off your base on some moves; set your feet before reaching.'
            : 'Your weight was often outside your feet — expect to feel pumped and swingy.',
    },
    {
      id: 'balance',
      label: 'Balance & flow',
      value: balLevel === 'good' ? 'Smooth' : balLevel === 'ok' ? 'A bit swingy' : 'Swingy',
      level: balLevel,
      hint:
        balLevel === 'good'
          ? 'Controlled, flowing movement with little swing.'
          : balLevel === 'ok'
            ? 'Some sway between moves — engage your core and keep hips in.'
            : 'Lots of swing/jerky movement — slow down and lead with your feet.',
    },
    {
      id: 'position',
      label: 'Body position',
      value: tilt < 18 ? 'Upright' : tilt < 32 ? 'Leaning' : 'Hanging back',
      level: posLevel,
      hint:
        posLevel === 'good'
          ? 'Hips in and torso stacked over your feet.'
          : posLevel === 'ok'
            ? 'You leaned off the wall at times; try to keep hips closer in.'
            : 'You hung back off straight arms a lot — get your hips to the wall.',
    },
  ]
}

/** Per-frame climber readout for the live Analyse view. */
export interface LiveClimberReadout {
  confidence: { value: string; level: Level }
  stability: { value: string; level: Level }
  com: { value: string; level: Level }
  balance: { value: string; level: Level }
}

export function climberFrameReadout(bio: BioFrame | null, meanVisibility: number): LiveClimberReadout {
  const confLevel: Level = meanVisibility > 0.75 ? 'good' : meanVisibility > 0.5 ? 'ok' : 'warn'

  const inside = bio?.comSupport?.inside ?? null
  const stability =
    inside == null
      ? { value: '—', level: 'ok' as Level }
      : inside
        ? { value: 'Over base', level: 'good' as Level }
        : { value: 'Off base', level: 'warn' as Level }

  // COM described in words: left/centre/right + high/low.
  let comVal = '—'
  let comLevel: Level = 'ok'
  if (bio?.com) {
    const lr = bio.com.x < 0.42 ? 'Left' : bio.com.x > 0.58 ? 'Right' : 'Centred'
    comVal = lr
    comLevel = lr === 'Centred' ? 'good' : 'ok'
  }

  // Balance from torso tilt this frame.
  const tilt = bio?.torsoInclination != null ? Math.abs(bio.torsoInclination) : null
  const balance =
    tilt == null
      ? { value: '—', level: 'ok' as Level }
      : tilt < 18
        ? { value: 'Balanced', level: 'good' as Level }
        : tilt < 32
          ? { value: 'Leaning', level: 'ok' as Level }
          : { value: 'Off-balance', level: 'warn' as Level }

  return {
    confidence: { value: pct(meanVisibility), level: confLevel },
    stability,
    com: { value: comVal, level: comLevel },
    balance,
  }
}
