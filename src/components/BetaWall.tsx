import { useMemo } from 'react'
import type { BetaStep, Hold, Limb, Point } from '../types'
import { LIMB_LABEL, LIMBS, arcPath, buildPose, holdMap, movedLimbs, resolveTarget } from '../lib/pose'
import type { Pose } from '../lib/pose'
import { HoldShape } from './HoldShape'

const W = 360
const H = 540

interface Props {
  holds: Hold[]
  steps: BetaStep[]
  stepIndex: number
  className?: string
}

function Figure({ pose, ghost }: { pose: Pose; ghost?: boolean }) {
  const body = ghost ? 'rgba(196,181,253,0.30)' : '#ede9fe'
  const under = ghost ? 'transparent' : 'rgba(8,10,18,0.9)'
  const dash = ghost ? '4 4' : undefined

  const limbs: Point[][] = [
    [pose.ls, pose.le, pose.lh],
    [pose.rs, pose.re, pose.rh],
    [pose.lhip, pose.lk, pose.lf],
    [pose.rhip, pose.rk, pose.rf],
  ]
  const pts = (a: Point[]) => a.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const torso = [pose.ls, pose.rs, pose.rhip, pose.lhip]

  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      {!ghost && (
        <>
          <polygon points={pts(torso)} stroke={under} strokeWidth={9} fill={under} />
          {limbs.map((l, i) => (
            <polyline key={i} points={pts(l)} stroke={under} strokeWidth={8} />
          ))}
        </>
      )}
      <polygon
        points={pts(torso)}
        stroke={body}
        strokeWidth={ghost ? 1.5 : 3}
        strokeDasharray={dash}
        fill={ghost ? 'none' : 'rgba(139,92,246,0.30)'}
      />
      {limbs.map((l, i) => (
        <polyline key={i} points={pts(l)} stroke={body} strokeWidth={ghost ? 1.5 : 3.4} strokeDasharray={dash} />
      ))}
      <circle
        cx={pose.head.x}
        cy={pose.head.y}
        r={11}
        fill={ghost ? 'none' : '#1b2133'}
        stroke={body}
        strokeWidth={ghost ? 1.5 : 3}
        strokeDasharray={dash}
      />
      {!ghost &&
        [pose.le, pose.re, pose.lk, pose.rk].map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.6} fill="#0b0e18" stroke={body} strokeWidth={1.6} />
        ))}
    </g>
  )
}

/** Hip marker on the figure plus a caption pinned to the bottom of the wall, clear of the climber. */
function CueLabel({ text, hip }: { text: string; hip: Point }) {
  const w = Math.min(W - 24, text.length * 6 + 52)
  const h = 26
  const x = (W - w) / 2
  const y = H - h - 14

  return (
    <g className="animate-fade-in">
      <circle cx={hip.x} cy={hip.y} r={9} fill="none" stroke="#a78bfa" strokeWidth={1.4} strokeDasharray="2.5 2.5" />
      <circle cx={hip.x} cy={hip.y} r={3} fill="#a78bfa" />
      <rect x={x} y={y} width={w} height={h} rx={13} fill="#0b0e18" fillOpacity={0.92} stroke="rgba(167,139,250,0.55)" />
      <circle cx={x + 14} cy={y + h / 2} r={3} fill="#a78bfa" />
      <text
        x={x + 26}
        y={y + h / 2 + 3.8}
        fontSize={11}
        fontWeight={500}
        fill="#ddd6fe"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {text}
      </text>
    </g>
  )
}

export function BetaWall({ holds, steps, stepIndex, className }: Props) {
  const step = steps[stepIndex]
  const prev = stepIndex > 0 ? steps[stepIndex - 1] : undefined

  const view = useMemo(() => {
    const map = holdMap(holds)
    const pose = buildPose(step.limbs, holds, step.hipShift)
    const ghost = prev ? buildPose(prev.limbs, holds, prev.hipShift) : null
    const moved = movedLimbs(prev?.limbs, step.limbs)

    // holds that have been used up to and including this step
    const used = new Set<string>()
    for (let i = 0; i <= stepIndex; i++) {
      for (const l of LIMBS) {
        const t = steps[i].limbs[l]
        if (typeof t === 'string') used.add(t)
      }
    }
    const current = new Set<string>()
    const targets = new Map<string, Limb>()
    for (const l of LIMBS) {
      const t = step.limbs[l]
      if (typeof t === 'string') {
        current.add(t)
        if (moved.includes(l) || stepIndex === 0) targets.set(t, l)
      }
    }
    const arrows = moved.map((l) => ({
      limb: l,
      d: arcPath(resolveTarget(prev!.limbs[l], map), resolveTarget(step.limbs[l], map), l.endsWith('h') ? 0.2 : -0.2),
      foot: l.endsWith('f'),
    }))
    const hipMove =
      ghost && Math.hypot(pose.hip.x - ghost.hip.x, pose.hip.y - ghost.hip.y) > 9
        ? arcPath(ghost.hip, pose.hip, 0.12, 6, 10)
        : null

    return { pose, ghost, used, current, targets, arrows, hipMove }
  }, [holds, step, prev, steps, stepIndex])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`Wall diagram for move ${stepIndex + 1}: ${step.title}`}
    >
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#151a2b" />
          <stop offset="1" stopColor="#0d111d" />
        </linearGradient>
        <pattern id="tnuts" width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="15" cy="15" r="1" fill="rgba(255,255,255,0.07)" />
        </pattern>
        <marker id="head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1.5 L8.5 5 L1 8.5 Z" fill="#c4b5fd" />
        </marker>
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={W} height={H} rx={18} fill="url(#wall)" />
      <rect width={W} height={H} rx={18} fill="url(#tnuts)" />
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={17.5} fill="none" stroke="rgba(255,255,255,0.08)" />

      {/* holds — drawn as typed, coloured shapes (jug/crimp/sloper/…) */}
      {holds.map((h) => {
        const isTarget = view.targets.has(h.id)
        const isHeld = view.current.has(h.id)
        const wasUsed = view.used.has(h.id)
        const route = h.kind !== 'off'
        const type = h.type ?? 'unknown'

        // Off-route holds and not-yet-used holds are dimmed so the active line
        // reads clearly; the current target is full-strength + pulsing.
        const opacity = isTarget || isHeld ? 1 : wasUsed ? 0.85 : route ? 0.6 : 0.3

        // Unknown-type holds (e.g. suggested targets with no shape) fall back
        // to the simple role-coloured ellipse.
        if (type === 'unknown') {
          const fill = isTarget ? '#a78bfa' : isHeld ? 'rgba(167,139,250,0.55)' : route ? '#343c58' : '#1d2336'
          return (
            <g key={h.id}>
              {isTarget && (
                <ellipse className="svg-pulse" cx={h.x} cy={h.y} rx={h.rx + 6} ry={h.ry + 6} fill="none" stroke="#a78bfa" strokeWidth={1.6} />
              )}
              <ellipse
                cx={h.x}
                cy={h.y}
                rx={h.rx}
                ry={h.ry}
                transform={`rotate(${h.rot} ${h.x} ${h.y})`}
                fill={fill}
                stroke={isTarget ? '#ede9fe' : 'rgba(255,255,255,0.14)'}
                strokeWidth={isTarget ? 1.8 : 1}
                filter={isTarget ? 'url(#glow)' : undefined}
              />
            </g>
          )
        }

        return (
          <g key={h.id} filter={isTarget ? 'url(#glow)' : undefined}>
            <HoldShape
              type={type}
              cx={h.x}
              cy={h.y}
              rx={h.rx}
              ry={h.ry}
              rot={h.rot}
              color={h.color}
              opacity={opacity}
              highlighted={isTarget}
            />
          </g>
        )
      })}

      {/* finish label */}
      {(() => {
        const f = holds.find((h) => h.kind === 'finish')
        return f ? (
          <text x={f.x} y={f.y - f.ry - 9} textAnchor="middle" fontSize={9} letterSpacing={1.5} fill="#8a93b2" fontFamily="JetBrains Mono, monospace">
            TOP
          </text>
        ) : null
      })()}

      {/* previous pose */}
      {view.ghost && <Figure pose={view.ghost} ghost />}

      {/* movement arrows */}
      <g key={`arrows-${stepIndex}`} className="animate-fade-in" fill="none" strokeLinecap="round">
        {view.hipMove && (
          <path d={view.hipMove} stroke="rgba(196,181,253,0.5)" strokeWidth={1.6} strokeDasharray="1 4" markerEnd="url(#head)" />
        )}
        {view.arrows.map((a) => (
          <path
            key={a.limb}
            d={a.d}
            stroke="#c4b5fd"
            strokeWidth={step.crux && !a.foot ? 3 : 2.2}
            strokeDasharray={a.foot ? '5 4' : undefined}
            markerEnd="url(#head)"
          />
        ))}
      </g>

      {/* current pose */}
      <g key={`pose-${stepIndex}`} className="animate-fade-in">
        <Figure pose={view.pose} />
      </g>

      {/* limb tags on target holds */}
      {Array.from(view.targets.entries()).map(([id, limb]) => {
        const h = holds.find((x) => x.id === id)
        if (!h) return null
        const left = limb.startsWith('l')
        const tx = left ? h.x - h.rx - 22 : h.x + h.rx + 4
        const ty = h.y - h.ry - 16
        return (
          <g key={id} className="animate-fade-in">
            <rect x={tx} y={ty} width={20} height={13} rx={4} fill="#a78bfa" />
            <text
              x={tx + 10}
              y={ty + 9.4}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={600}
              fill="#0b0e18"
              fontFamily="JetBrains Mono, monospace"
            >
              {LIMB_LABEL[limb]}
            </text>
          </g>
        )
      })}

      <CueLabel text={step.cue.text} hip={view.pose.hip} />
    </svg>
  )
}
