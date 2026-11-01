/**
 * Draws the SUGGESTED BETA for the current move directly on the video, synced
 * to playback: the target hold(s) for the move, and movement arrows from the
 * previous contact to the target. As the video plays, `activeStep` advances
 * (driven by player time in VideoPanel), so the suggestion tracks the climb.
 *
 * Positions live in the 360×540 beta-wall space (same normalised source image
 * as the pose), so we convert back to 0–1 and letterbox into the video box.
 */

import type { Analysis, Hold, Limb, LimbTarget } from '../types'

const WALL_W = 360
const WALL_H = 540

interface Props {
  analysis: Analysis
  /** index of the move to visualise (driven by playback time) */
  activeStep: number
  box: { width: number; height: number }
  /** source video dimensions, for letterboxing */
  video: { w: number; h: number }
}

function fit(nx: number, ny: number, video: { w: number; h: number }, box: { width: number; height: number }) {
  const scale = Math.min(box.width / video.w, box.height / video.h)
  const dispW = video.w * scale
  const dispH = video.h * scale
  const offX = (box.width - dispW) / 2
  const offY = (box.height - dispH) / 2
  return { x: offX + nx * dispW, y: offY + ny * dispH }
}

export function BetaVideoOverlay({ analysis, activeStep, box, video }: Props) {
  if (box.width === 0 || video.w === 0) return null
  const beta = analysis.beta
  const step = beta[Math.max(0, Math.min(activeStep, beta.length - 1))]
  if (!step) return null
  const prev = activeStep > 0 ? beta[activeStep - 1] : undefined

  const holdById = new Map(analysis.holds.map((h) => [h.id, h]))

  // Resolve a limb target (hold id or free point) to wall-space coords.
  const toWallPoint = (t: LimbTarget | undefined): { x: number; y: number } | null => {
    if (t == null) return null
    if (typeof t === 'string') {
      const h = holdById.get(t)
      return h ? { x: h.x, y: h.y } : null
    }
    return { x: t.x, y: t.y }
  }

  // Convert wall-space (360×540) → display pixels.
  const toDisp = (wx: number, wy: number) => fit(wx / WALL_W, wy / WALL_H, video, box)

  const limbs: Limb[] = ['lh', 'rh', 'lf', 'rf']
  // Prefer the coach-declared moving limb; else fall back to what changed.
  const moved: Limb[] = step.moveLimb
    ? [step.moveLimb as Limb]
    : limbs.filter((l) => {
        if (!prev) return true
        return JSON.stringify(prev.limbs[l]) !== JSON.stringify(step.limbs[l])
      })

  // Target holds for this move (where moved limbs are going).
  const targets = moved
    .map((l) => ({ limb: l, p: toWallPoint(step.limbs[l]) }))
    .filter((t): t is { limb: Limb; p: { x: number; y: number } } => !!t.p)

  // Movement arrows from previous position → target.
  const arrows = prev
    ? moved
        .map((l) => {
          const from = toWallPoint(prev.limbs[l])
          const to = toWallPoint(step.limbs[l])
          return from && to ? { limb: l, from, to } : null
        })
        .filter((a): a is { limb: Limb; from: { x: number; y: number }; to: { x: number; y: number } } => !!a)
    : []

  const isFoot = (l: Limb) => l.endsWith('f')

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={box.width}
      height={box.height}
      viewBox={`0 0 ${box.width} ${box.height}`}
      aria-hidden
    >
      <defs>
        <marker id="beta-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1.5 L8.5 5 L1 8.5 Z" fill="#c4b5fd" />
        </marker>
      </defs>

      {/* All detected holds (faint), so the wall context is visible */}
      {analysis.holds.map((h: Hold) => {
        if (h.kind === 'off') return null
        const d = toDisp(h.x, h.y)
        return <circle key={h.id} cx={d.x} cy={d.y} r={5} fill="none" stroke="rgba(167,139,250,0.35)" strokeWidth={1.5} />
      })}

      {/* Movement arrows for this move */}
      {arrows.map((a) => {
        const f = toDisp(a.from.x, a.from.y)
        const t = toDisp(a.to.x, a.to.y)
        // slight bow
        const mx = (f.x + t.x) / 2 + (t.y - f.y) * 0.18
        const my = (f.y + t.y) / 2 - (t.x - f.x) * 0.18
        return (
          <path
            key={`arr-${a.limb}`}
            d={`M${f.x} ${f.y} Q${mx} ${my} ${t.x} ${t.y}`}
            fill="none"
            stroke="#c4b5fd"
            strokeWidth={isFoot(a.limb) ? 2 : 2.6}
            strokeDasharray={isFoot(a.limb) ? '5 4' : undefined}
            markerEnd="url(#beta-arrow)"
            opacity={0.95}
          />
        )
      })}

      {/* Target holds, pulsing, with limb label */}
      {targets.map((t) => {
        const d = toDisp(t.p.x, t.p.y)
        return (
          <g key={`tgt-${t.limb}`}>
            <circle cx={d.x} cy={d.y} r={14} fill="none" stroke="#a78bfa" strokeWidth={2} className="svg-pulse" />
            <circle cx={d.x} cy={d.y} r={7} fill="rgba(167,139,250,0.9)" stroke="#ede9fe" strokeWidth={1.5} />
            <text
              x={d.x}
              y={d.y - 18}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="#ddd6fe"
              fontFamily="JetBrains Mono, monospace"
            >
              {t.limb.toUpperCase()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
