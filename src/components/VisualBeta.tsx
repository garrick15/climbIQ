import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react'
import type { Analysis } from '../types'
import type { MoveRating } from '../types'
import { LIMBS, LIMB_LABEL, LIMB_NAME, holdMap, movedLimbs } from '../lib/pose'
import { HOLD_LABEL } from '../lib/holdTypes'
import { BetaWall } from './BetaWall'
import { Card, Eyebrow, TimeChip, cx } from './ui'

const RATING_META: Record<MoveRating, { label: string; cls: string; dot: string }> = {
  best: { label: 'Best move', cls: 'bg-good/20 text-good border-good/40', dot: 'bg-good' },
  good: { label: 'Good', cls: 'bg-accent-500/20 text-accent-200 border-accent-500/40', dot: 'bg-accent-400' },
  inaccuracy: { label: 'Inaccuracy', cls: 'bg-warn/20 text-warn border-warn/40', dot: 'bg-warn' },
  mistake: { label: 'Mistake', cls: 'bg-red-400/20 text-red-300 border-red-400/40', dot: 'bg-red-400' },
}

function RatingBadge({ rating }: { rating: MoveRating }) {
  const m = RATING_META[rating]
  return (
    <span className={cx('shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wide', m.cls)}>
      {m.label}
    </span>
  )
}

interface Props {
  analysis: Analysis
  stepIndex: number
  onStep: (i: number) => void
  onSeek: (t: number) => void
  /** true while the wall is auto-following video playback */
  followVideo?: boolean
}

export function VisualBeta({ analysis, stepIndex, onStep, onSeek, followVideo }: Props) {
  const { beta, holds } = analysis
  const [auto, setAuto] = useState(false)

  // Empty beta → nothing to visualise (don't crash).
  if (beta.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-slate-400">
        No suggested moves for this climb. Try a clearer, side-on clip with your whole body in frame.
      </Card>
    )
  }

  // Clamp the incoming index so an out-of-range value can never read undefined.
  const safeIndex = Math.min(Math.max(0, stepIndex), beta.length - 1)
  const step = beta[safeIndex]
  const prev = safeIndex > 0 ? beta[safeIndex - 1] : undefined
  const names = holdMap(holds)
  const moved = movedLimbs(prev?.limbs, step.limbs)
  const last = beta.length - 1

  useEffect(() => {
    // The internal auto-player is only for when the wall is NOT following the
    // video; otherwise video playback drives the step and two clocks would fight.
    if (!auto || followVideo) return
    const id = setInterval(() => {
      onStep(stepIndex >= last ? 0 : stepIndex + 1)
    }, 2800)
    return () => clearInterval(id)
  }, [auto, followVideo, stepIndex, last, onStep])

  const go = (i: number) => {
    setAuto(false)
    onStep(Math.min(Math.max(0, i), last))
  }

  return (
    <div
      className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
      tabIndex={0}
      aria-label="Visual beta. Use the left and right arrow keys to change move."
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(safeIndex + 1)
        if (e.key === 'ArrowLeft') go(safeIndex - 1)
      }}
    >
      <div className="mx-auto w-full max-w-[340px] lg:mx-0">
        <BetaWall
          holds={holds}
          steps={beta}
          stepIndex={safeIndex}
          className="w-full rounded-[18px] shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent-400" /> Target hold
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden>
              <path d="M1 4 H15" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Hand move
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden>
              <path d="M1 4 H15" stroke="#c4b5fd" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
            </svg>
            Foot move
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-full border border-dashed border-accent-300/50" /> Last position
          </span>
        </div>
      </div>

      <Card className="flex flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Eyebrow>
                Move {safeIndex + 1} of {beta.length}
              </Eyebrow>
              {followVideo && (
                <span className="inline-flex items-center gap-1 rounded-full border border-good/40 bg-good/15 px-2 py-0.5 text-[10px] font-medium text-good">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                  Following video
                </span>
              )}
            </div>
            <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-white" aria-live="polite">
              {step.title}
            </h3>
          </div>
          {step.crux && (
            <span className="shrink-0 rounded-full border border-accent-500/40 bg-accent-500/15 px-2.5 py-1 text-[11px] font-medium text-accent-200">
              Crux
            </span>
          )}
        </div>

        <div className="mt-4 flex gap-1.5" role="group" aria-label="Moves">
          {beta.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              title={`${i + 1}. ${s.title}`}
              aria-label={`Go to move ${i + 1}: ${s.title}`}
              aria-current={i === safeIndex ? 'step' : undefined}
              className="group flex-1 py-2"
            >
              <span
                className={cx(
                  'block h-1.5 rounded-full transition-colors',
                  // Colour each move's dot by its chess.com-style rating so the
                  // whole climb reads at a glance; current move is brightest.
                  s.rating
                    ? RATING_META[s.rating].dot
                    : i <= safeIndex
                      ? 'bg-accent-400'
                      : 'bg-white/10 group-hover:bg-white/20',
                  i === safeIndex ? 'ring-2 ring-white/50' : i > safeIndex && !s.rating ? '' : 'opacity-80',
                )}
              />
            </button>
          ))}
        </div>

        {/* Chess.com-style instruction: verdict + the one directive + why. */}
        <div className="mt-3 rounded-xl border border-accent-500/20 bg-accent-500/[0.06] p-4">
          <div className="flex items-start gap-3">
            {step.rating && <RatingBadge rating={step.rating} />}
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug text-white">
                {step.instruction || step.summary}
              </p>
              {(step.reason || step.why) && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">
                  <span className="font-medium text-accent-200">Why: </span>
                  {step.reason || step.why}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* What each limb does this move — the action, not a static label. */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {LIMBS.map((l) => {
            const t = step.limbs[l]
            const heldHold = typeof t === 'string' ? names.get(t) : undefined
            const label = heldHold?.name ?? (typeof t === 'string' ? t : 'free')
            const holdType = heldHold?.type && heldHold.type !== 'unknown' ? HOLD_LABEL[heldHold.type] : null
            const isMover = step.moveLimb ? step.moveLimb === l : moved.includes(l) || safeIndex === 0
            return (
              <div
                key={l}
                className={cx(
                  'rounded-xl border px-3 py-2.5 transition-colors',
                  isMover ? 'border-accent-500/50 bg-accent-500/12' : 'bg-white/[0.02]',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-wider text-slate-500">{LIMB_LABEL[l]}</span>
                  <span
                    className={cx(
                      'text-[9px] font-semibold uppercase tracking-wide',
                      isMover ? 'text-accent-300' : 'text-slate-600',
                    )}
                  >
                    {isMover ? '● Move' : 'Stay'}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] font-medium text-slate-100" title={`${LIMB_NAME[l]}: ${label}`}>
                  {heldHold?.color && (
                    <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: heldHold.color }} />
                  )}
                  <span className="truncate">
                    {isMover ? '→ ' : ''}
                    {label}
                    {holdType ? ` · ${holdType}` : ''}
                  </span>
                </p>
              </div>
            )
          })}
        </div>

        <dl className="mt-5 space-y-4 text-sm leading-relaxed">
          {step.bodyPosition && (
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Body position</dt>
              <dd className="mt-1 text-slate-300">{step.bodyPosition}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex items-start justify-between gap-3 rounded-xl border bg-white/[0.025] p-3.5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">What you did</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-300">
              {step.yourAttempt || 'Jump to this moment to compare your movement with the suggestion.'}
            </p>
          </div>
          <TimeChip t={step.timestamp} onClick={onSeek} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
          <button
            type="button"
            onClick={() => setAuto((a) => !a)}
            className="inline-flex items-center gap-2 rounded-lg border bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
          >
            {auto ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {auto ? 'Pause' : 'Play sequence'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(safeIndex - 1)}
              disabled={safeIndex === 0}
              aria-label="Previous move"
              className="grid h-9 w-9 place-items-center rounded-lg border bg-white/[0.04] text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(safeIndex + 1)}
              disabled={safeIndex === last}
              aria-label="Next move"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next move <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
