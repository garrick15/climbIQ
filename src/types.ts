export type Limb = 'lh' | 'rh' | 'lf' | 'rf'

export type HoldKind = 'start' | 'hand' | 'foot' | 'finish' | 'off'

export interface Point {
  x: number
  y: number
}

export interface Hold extends Point {
  id: string
  name: string
  kind: HoldKind
  /** ellipse radii and rotation, used to draw a varied hold shape */
  rx: number
  ry: number
  rot: number
}

/** A limb is either on a hold (by id) or at a free point (flag / smear). */
export type LimbTarget = string | Point
export type LimbState = Record<Limb, LimbTarget>

export interface BetaStep {
  id: string
  title: string
  /** one-line instruction */
  summary: string
  bodyPosition: string
  why: string
  /** what the climber actually did at this point in the video */
  yourAttempt: string
  /** seconds into the uploaded video */
  timestamp: number
  /** limb positions AFTER this step is complete */
  limbs: LimbState
  /** horizontal hip offset in wall units, shows weight shift */
  hipShift: number
  cue: { text: string; side: 'left' | 'right' }
  crux?: boolean
}

export type FeedbackKind = 'strength' | 'improve'

export interface FeedbackItem {
  id: string
  kind: FeedbackKind
  timestamp: number
  title: string
  observation: string
  why: string
  tryThis?: string
  skill: string
  stepId?: string
}

export interface Drill {
  name: string
  prescription: string
  detail: string
}

export interface TrainingFocus {
  id: string
  rank: number
  skill: string
  headline: string
  reason: string
  impact: 'High' | 'Medium'
  /** 0–100, drives the impact meter */
  impactScore: number
  cue: string
  cadence: string
  evidence: { timestamp: number; label: string }[]
  drills: Drill[]
}

export interface Metric {
  id: string
  label: string
  /** 0–100 */
  value: number
  note: string
}

/** Where an analysis came from, so the UI can be honest about it. */
export type AnalysisSource = 'demo' | 'ai'

export interface Analysis {
  /**
   * 'demo'  → clearly-labelled sample data (no real video analysed).
   * 'ai'    → real MediaPipe pose + Muse Spark coaching for the uploaded clip.
   */
  source: AnalysisSource
  /** present on real analyses: facts the UI can show honestly */
  provenance?: {
    poseDetectionRate: number
    framesSampled: number
    holdsDetected: boolean
    notes: string[]
  }
  climb: {
    outcome: string
    durationSec: number
    moves: number
    holdsDetected: number
  }
  metrics: Metric[]
  holds: Hold[]
  beta: BetaStep[]
  feedback: FeedbackItem[]
  training: TrainingFocus[]
}

export interface VideoMeta {
  duration: number
  width: number
  height: number
}

export type View = 'upload' | 'processing' | 'results'
