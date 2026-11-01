/**
 * "Demonstrate the beta" — a focused, self-contained player that walks through
 * the model's SUGGESTED sequence move by move, so a stuck climber can watch how
 * to do the problem. It animates the stick figure on the wall (BetaWall) with
 * the current move's instruction shown large, plus a readable full-sequence
 * list. This is a demonstration of the suggested beta, not a guaranteed solution.
 *
 * Standalone: it does not touch the review screen. Launched as a modal overlay.
 */

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Pause, Play, Repeat, X } from 'lucide-react'
import type { Analysis, BetaStep, MoveRating } from '../types'
import { LIMB_NAME } from '../lib/pose'
import { BetaWall } from './BetaWall'
import { cx } from './ui'

interface Props {
  analysis: Analysis
  onClose: () => void
}

const SPEEDS = [0.5, 1, 1.5] as const
const RATING_DOT: Record<MoveRating, string> = {
  best: 'bg-good',
  good: 'bg-accent-400',
  inaccuracy: 'bg-warn',
  mistake: 'bg-red-400',
}

export function BetaDemo({ analysis, onClose }: Props) {
  const beta = analysis.beta
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [loop, setLoop] = useState(true)
  const [speed, setSpeed] = useState<number>(1)

  const last = beta.length - 1
  const step: BetaStep | undefined = beta[Math.min(i, last)]

  const go = useCallback(
    (n: number) => {
      setI(Math.min(Math.max(0, n), last))
    },
    [last],
  )

  // Auto-advance through the sequence while playing.
  useEffect(() => {
    if (!playing || beta.length < 2) return
    const id = setInterval(() => {
      setI((cur) => {
        if (cur >= last) {
          if (loop) return 0
          setPlaying(false)
          return cur
        }
        return cur + 1
      })
    }, 2600 / speed)
    return () => clearInterval(id)
  }, [playing, loop, speed, last, beta.length])

  // Lock background scroll while the demo modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Escape closes; arrows step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') {
        setPlaying(false)
        go(i + 1)
      }
      if (e.key === 'ArrowLeft') {
        setPlaying(false)
        go(i - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, go, onClose])

  if (!step) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Beta demonstration"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-accent-300">Suggested demonstration</p>
            <h2 className="text-lg font-semibold text-white">How to climb it — the beta</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close demonstration"
            className="grid h-9 w-9 place-items-center rounded-lg border bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: wall animation (left) + move detail & list (right) */}
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* Animated wall */}
          <div>
            <BetaWall
              holds={analysis.holds}
              steps={beta}
              stepIndex={Math.min(i, last)}
              className="w-full rounded-[18px]"
            />
            {/* Controls */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-500"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false)
                    go(i - 1)
                  }}
                  disabled={i === 0}
                  aria-label="Previous move"
                  className="grid h-9 w-9 place-items-center rounded-lg border bg-white/[0.04] text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-35"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false)
                    go(i + 1)
                  }}
                  disabled={i === last}
                  aria-label="Next move"
                  className="grid h-9 w-9 place-items-center rounded-lg border bg-white/[0.04] text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-35"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLoop((l) => !l)}
                  aria-pressed={loop}
                  title="Loop the sequence"
                  className={cx(
                    'grid h-9 w-9 place-items-center rounded-lg border transition-colors',
                    loop ? 'border-accent-400/50 bg-accent-500/20 text-accent-200' : 'bg-white/[0.04] text-slate-400 hover:text-slate-200',
                  )}
                >
                  <Repeat className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Speed */}
            <div className="mt-2 flex items-center justify-center gap-1 rounded-lg border p-0.5" role="group" aria-label="Speed">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={cx(
                    'flex-1 rounded-md py-1 font-mono text-[11px] transition-colors',
                    speed === s ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          {/* Current move + full sequence */}
          <div className="flex min-w-0 flex-col">
            {/* Big current instruction */}
            <div className="rounded-xl border border-accent-500/20 bg-accent-500/[0.06] p-4">
              <p className="font-mono text-xs text-accent-300">
                Move {Math.min(i, last) + 1} of {beta.length}
              </p>
              <h3 className="mt-1 text-xl font-semibold leading-snug text-white">
                {step.instruction || step.title}
              </h3>
              {(step.reason || step.summary) && (
                <p className="mt-2 text-[14px] leading-relaxed text-slate-300">{step.reason || step.summary}</p>
              )}
              {step.moveLimb && (
                <p className="mt-2 text-xs text-slate-500">
                  Lead with your <span className="font-medium text-slate-300">{LIMB_NAME[step.moveLimb]}</span>
                </p>
              )}
            </div>

            {/* Full sequence — the whole beta, click to jump */}
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              The full beta
            </p>
            <ol className="space-y-1.5">
              {beta.map((s, k) => {
                const active = k === Math.min(i, last)
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false)
                        go(k)
                      }}
                      className={cx(
                        'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                        active ? 'border-accent-500/50 bg-accent-500/12' : 'bg-white/[0.02] hover:bg-white/[0.05]',
                      )}
                    >
                      <span
                        className={cx(
                          'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold',
                          active ? 'bg-accent-500 text-white' : 'bg-white/[0.06] text-slate-400',
                        )}
                      >
                        {k + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-[13.5px] font-medium text-slate-100">
                          {s.rating && <span className={cx('h-2 w-2 shrink-0 rounded-full', RATING_DOT[s.rating])} />}
                          {s.instruction || s.title}
                        </span>
                        {active && (s.reason || s.summary) && (
                          <span className="mt-0.5 block text-[12px] leading-snug text-slate-400">
                            {s.reason || s.summary}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        {/* Footer honesty note */}
        <div className="border-t px-5 py-2.5 text-center text-[11px] text-slate-500">
          A suggested demonstration from ClimbIQ — one good way to climb it, not the only way.
        </div>
      </div>
    </div>
  )
}
