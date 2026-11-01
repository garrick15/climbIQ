/**
 * Live analysis viewport shown while the climb is being processed.
 *
 * It renders the exact frame MediaPipe is analysing, with:
 *   - a bounding box around the detected climber,
 *   - the real skeleton (shoulders, torso, arms, legs), and
 *   - a live stats readout (joint angles, approximate COM, confidence)
 * all computed from the actual measured landmarks — not decoration.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { POSE_CONNECTIONS } from '../lib/pose-estimation'
import type { LiveFrame } from '../lib/pose-estimation'
import { bioFrame } from '../lib/biomechanics'
import { climberFrameReadout } from '../lib/climberMetrics'
import type { Level } from '../lib/climberMetrics'
import { cx } from './ui'

interface Props {
  frame: LiveFrame | null
}

/** Fit a normalised point into an object-contain box (letterboxed). */
function fit(
  nx: number,
  ny: number,
  video: { w: number; h: number },
  box: { width: number; height: number },
) {
  const scale = Math.min(box.width / video.w, box.height / video.h)
  const dispW = video.w * scale
  const dispH = video.h * scale
  const offX = (box.width - dispW) / 2
  const offY = (box.height - dispH) / 2
  return { x: offX + nx * dispW, y: offY + ny * dispH }
}

const KEY_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

const deg = (n: number) => (Number.isFinite(n) ? `${Math.round(n)}°` : '—')

export function LiveAnalysisView({ frame }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setBox({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const video = frame ? { w: frame.width, h: frame.height } : { w: 1, h: 1 }
  const lm = frame?.landmarks ?? null
  const pts = lm && box.width ? lm.map((l) => fit(l.x, l.y, video, box)) : null

  // Real per-frame biomechanics from the measured landmarks.
  const bio = frame && lm ? bioFrame({ t: frame.t, landmarks: lm, visibility: frame.visibility }) : null
  const angles = bio?.angles ?? null
  const com = bio?.com ?? null

  const meanVisibility =
    frame?.visibility && frame.visibility.length
      ? frame.visibility.reduce((a, b) => a + b, 0) / frame.visibility.length
      : 0

  // Climber-friendly readout for this frame (confidence/stability/COM/balance).
  const readout = climberFrameReadout(bio, meanVisibility)

  // Bounding box in display pixels.
  const bb =
    frame?.bbox && box.width
      ? (() => {
          const tl = fit(frame.bbox.x, frame.bbox.y, video, box)
          const br = fit(frame.bbox.x + frame.bbox.w, frame.bbox.y + frame.bbox.h, video, box)
          return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }
        })()
      : null

  return (
    <div className="w-full">
      <div
        ref={stageRef}
        className="relative mx-auto aspect-[3/4] w-full max-w-[360px] overflow-hidden rounded-[18px] border border-white/10 bg-black shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)]"
      >
        {frame?.image ? (
          <img src={frame.image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="grid-lines absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#171d31,#0a0d16_70%)]" />
        )}

        {/* subtle darkening so overlays read clearly */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/50 via-transparent to-ink-950/30" />

        {box.width > 0 && (
          <svg
            className="absolute inset-0"
            width={box.width}
            height={box.height}
            viewBox={`0 0 ${box.width} ${box.height}`}
            aria-hidden
          >
            {/* Bounding box around the climber */}
            {bb && (
              <>
                <rect
                  x={bb.x}
                  y={bb.y}
                  width={bb.w}
                  height={bb.h}
                  fill="none"
                  stroke="#4ade9f"
                  strokeWidth={2}
                  rx={6}
                  opacity={0.9}
                />
                <g>
                  <rect x={bb.x} y={Math.max(0, bb.y - 18)} width={96} height={16} rx={4} fill="#4ade9f" />
                  <text x={bb.x + 6} y={Math.max(11, bb.y - 6)} fontSize="10" fontFamily="monospace" fill="#06281b">
                    CLIMBER {Math.round(meanVisibility * 100)}%
                  </text>
                </g>
              </>
            )}

            {/* Skeleton bones */}
            {pts &&
              POSE_CONNECTIONS.map(([a, b], i) => {
                const va = frame?.visibility?.[a] ?? 1
                const vb = frame?.visibility?.[b] ?? 1
                if (va < 0.3 || vb < 0.3) return null
                return (
                  <line
                    key={i}
                    x1={pts[a].x}
                    y1={pts[a].y}
                    x2={pts[b].x}
                    y2={pts[b].y}
                    stroke="#a78bfa"
                    strokeWidth={3}
                    strokeLinecap="round"
                    opacity={0.95}
                  />
                )
              })}

            {/* Joints */}
            {pts &&
              KEY_JOINTS.map((i) => {
                const v = frame?.visibility?.[i] ?? 1
                if (v < 0.3) return null
                return <circle key={i} cx={pts[i].x} cy={pts[i].y} r={4} fill="#ddd6fe" stroke="#7c3aed" strokeWidth={1.5} />
              })}

            {/* Approximate centre of mass */}
            {com && (
              <g>
                {(() => {
                  const c = fit(com.x, com.y, video, box)
                  return (
                    <>
                      <circle cx={c.x} cy={c.y} r={7} fill="none" stroke="#f2b84b" strokeWidth={2} />
                      <circle cx={c.x} cy={c.y} r={2} fill="#f2b84b" />
                    </>
                  )
                })()}
              </g>
            )}
          </svg>
        )}

        {/* scanning line while working */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 h-px animate-scan bg-gradient-to-r from-transparent via-accent-300 to-transparent shadow-[0_0_18px_4px_rgb(167_139_250/0.55)]"
        />

        {/* no-person hint */}
        {frame && !lm && (
          <p className="absolute inset-x-0 bottom-4 text-center font-mono text-[11px] uppercase tracking-wider text-warn/90">
            Searching for a climber…
          </p>
        )}
      </div>

      {/* Climber-friendly readout (what a climber cares about) */}
      <div className="mx-auto mt-3 grid max-w-[360px] grid-cols-2 gap-2 sm:grid-cols-4">
        <LevelStat label="Confidence" value={readout.confidence.value} level={readout.confidence.level} />
        <LevelStat label="Stability" value={readout.stability.value} level={readout.stability.level} />
        <LevelStat label="Centre of mass" value={readout.com.value} level={readout.com.level} />
        <LevelStat label="Balance" value={readout.balance.value} level={readout.balance.level} />
      </div>

      {/* Technical detail (secondary) */}
      <div className="mx-auto mt-2 grid max-w-[360px] grid-cols-4 gap-2">
        <Stat label="L elbow" value={deg(angles?.leftElbow ?? NaN)} />
        <Stat label="R elbow" value={deg(angles?.rightElbow ?? NaN)} />
        <Stat label="Torso tilt" value={bio?.torsoInclination != null ? deg(Math.abs(bio.torsoInclination)) : '—'} />
        <Stat label="Hip rot." value={bio?.hipRotation != null ? deg(Math.abs(bio.hipRotation)) : '—'} />
      </div>
      <p className="mx-auto mt-2 max-w-[360px] px-1 text-center text-[10.5px] leading-snug text-slate-600">
        Live pose from MediaPipe. Centre of mass &amp; balance are approximate 2D estimates.
      </p>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={cx(
        'rounded-xl border px-2.5 py-2 text-center',
        highlight ? 'border-accent-500/40 bg-accent-500/10' : 'bg-white/[0.03]',
      )}
    >
      <div className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm tabular-nums text-slate-100">{value}</div>
    </div>
  )
}

const LEVEL_CLASS: Record<Level, string> = {
  good: 'border-good/40 bg-good/[0.1] text-good',
  ok: 'border-accent-500/40 bg-accent-500/[0.1] text-accent-200',
  warn: 'border-warn/40 bg-warn/[0.1] text-warn',
}

/** A climber-facing stat with a colour that reflects good/ok/warn. */
function LevelStat({ label, value, level }: { label: string; value: string; level: Level }) {
  return (
    <div className={cx('rounded-xl border px-2.5 py-2 text-center', LEVEL_CLASS[level])}>
      <div className="text-[9px] font-medium uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-white">{value}</div>
    </div>
  )
}
