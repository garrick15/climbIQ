/**
 * The per-move coaching panel (right side of the results screen), styled after
 * a chess.com-style "analysis" card: verdict header, the one instruction, a
 * "Your attempt vs Recommended" compare, ordered movement steps, and a coach
 * note. Driven by the current move so it tracks the video.
 */

import { Check, ChevronLeft, ChevronRight, Lightbulb, Trophy, X } from 'lucide-react'
import type { Analysis, BetaStep } from '../types'
import { LIMB_NAME } from '../lib/pose'
import { Card, cx } from './ui'

interface Props {
  analysis: Analysis
  stepIndex: number
  onStep: (i: number) => void
}

const RATING = {
  best: { label: 'Best move', ring: 'text-good', chip: 'bg-good/15 text-good border-good/40' },
  good: { label: 'Solid move', ring: 'text-accent-300', chip: 'bg-accent-500/15 text-accent-200 border-accent-500/40' },
  inaccuracy: { label: 'Inaccuracy', ring: 'text-warn', chip: 'bg-warn/15 text-warn border-warn/40' },
  mistake: { label: 'Mistake', ring: 'text-red-300', chip: 'bg-red-400/15 text-red-300 border-red-400/40' },
} as const

export function MoveCoachPanel({ analysis, stepIndex, onStep }: Props) {
  const beta = analysis.beta
  const i = Math.min(Math.max(0, stepIndex), beta.length - 1)
  const step: BetaStep | undefined = beta[i]
  if (!step) return null

  const rating = step.rating ?? 'good'
  const r = RATING[rating]
  const limbName = step.moveLimb ? LIMB_NAME[step.moveLimb] : null

  const issues = step.attemptIssues ?? []
  const wins = step.recommendedWins ?? []
  const steps = step.moveSteps ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* Header: verdict + success chip + move nav */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <Check className={cx('h-5 w-5', r.ring)} aria-hidden />
          <span className="text-sm font-semibold text-white">Suggested beta</span>
        </div>
        <div className="flex items-center gap-2">
          {typeof step.successRate === 'number' && (
            <span className="rounded-full border border-good/40 bg-good/15 px-2.5 py-1 text-[11px] font-semibold text-good">
              {step.successRate}% success
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onStep(i - 1)}
              disabled={i === 0}
              aria-label="Previous move"
              className="grid h-7 w-7 place-items-center rounded-lg border bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[64px] text-center font-mono text-xs text-slate-400">
              Move {i + 1} / {beta.length}
            </span>
            <button
              type="button"
              onClick={() => onStep(i + 1)}
              disabled={i === beta.length - 1}
              aria-label="Next move"
              className="grid h-7 w-7 place-items-center rounded-lg border bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* The instruction (headline) + reason */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx('rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', r.chip)}>
            {r.label}
          </span>
          {step.crux && (
            <span className="rounded-lg border border-accent-500/40 bg-accent-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-200">
              Crux
            </span>
          )}
        </div>
        <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-white">
          {step.instruction || step.title}
        </h2>
        {(step.reason || step.summary) && (
          <p className="mt-2 text-[15px] leading-relaxed text-slate-300">{step.reason || step.summary}</p>
        )}
        {limbName && (
          <p className="mt-2 text-xs text-slate-500">
            Leading limb: <span className="font-medium text-slate-300">{limbName}</span>
          </p>
        )}
      </div>

      {/* Your attempt vs Recommended */}
      {(issues.length > 0 || wins.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span className="h-2 w-2 rounded-full bg-red-400" /> Your attempt
            </p>
            <ul className="mt-2 space-y-1.5">
              {(issues.length ? issues : ['See the video for your movement']).map((t, k) => (
                <li key={k} className="flex gap-1.5 text-[12.5px] leading-snug text-slate-300">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" /> {t}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="border-good/30 bg-good/[0.05] p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-good">
              <Check className="h-3.5 w-3.5" /> Recommended
            </p>
            <ul className="mt-2 space-y-1.5">
              {(wins.length ? wins : ['Keep balance and commit']).map((t, k) => (
                <li key={k} className="flex gap-1.5 text-[12.5px] leading-snug text-slate-200">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" /> {t}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* Movement steps */}
      {steps.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Movement steps</p>
          <ol className="space-y-2">
            {steps.map((s, k) => (
              <li key={k} className="flex items-center gap-3 rounded-xl border bg-white/[0.02] px-3 py-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-500/20 font-mono text-[11px] font-semibold text-accent-200">
                  {k + 1}
                </span>
                <span className="text-[13.5px] text-slate-200">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Coach notes */}
      {step.coachNote && (
        <Card className="border-amber-400/25 bg-amber-400/[0.06] p-4">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-300">
            <Lightbulb className="h-4 w-4" /> Coach notes
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-200">{step.coachNote}</p>
        </Card>
      )}

      {/* Outcome footer */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Trophy className="h-3.5 w-3.5 text-accent-300" aria-hidden />
        {analysis.climb.outcome} · {beta.length} moves
      </div>
    </div>
  )
}
