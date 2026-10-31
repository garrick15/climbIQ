import { useMemo, useState } from 'react'
import { ArrowUpRight, CircleCheck, Lightbulb, TriangleAlert } from 'lucide-react'
import type { Analysis, FeedbackKind } from '../types'
import { Card, TimeChip, cx } from './ui'

interface Props {
  analysis: Analysis
  time: number
  onSeek: (t: number, autoplay?: boolean) => void
  onOpenStep: (stepId: string) => void
}

type Filter = 'all' | FeedbackKind

export function FeedbackPanel({ analysis, time, onSeek, onOpenStep }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const items = useMemo(
    () => [...analysis.feedback].sort((a, b) => a.timestamp - b.timestamp),
    [analysis.feedback],
  )
  const strengths = items.filter((i) => i.kind === 'strength').length
  const improve = items.length - strengths
  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter)

  // the item the playhead is currently inside (within ~6s of its timestamp)
  const activeId = useMemo(() => {
    let found: string | undefined
    for (const i of items) if (i.timestamp <= time + 0.15 && time - i.timestamp < 6) found = i.id
    return found
  }, [items, time])

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'strength', label: 'Done well', count: strengths },
    { id: 'improve', label: 'To improve', count: improve },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          <span className="font-medium text-good">{strengths} things done well</span>
          <span className="mx-2 text-slate-600">·</span>
          <span className="font-medium text-warn">{improve} to improve</span>
        </p>
        <div className="inline-flex rounded-lg border bg-ink-850 p-0.5" role="group" aria-label="Filter feedback">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              aria-pressed={filter === t.id}
              className={cx(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                filter === t.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {t.label} <span className="ml-1 font-mono text-[10px] text-slate-500">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-4 space-y-3">
        {shown.map((f) => {
          const good = f.kind === 'strength'
          const active = f.id === activeId
          return (
            <li key={f.id}>
              <Card
                className={cx(
                  'relative overflow-hidden p-5 transition-shadow',
                  active && 'ring-1 ring-accent-500/60 shadow-[0_0_0_4px_rgb(139_92_246/0.08)]',
                )}
              >
                <span
                  aria-hidden
                  className={cx('absolute inset-y-0 left-0 w-[3px]', good ? 'bg-good/70' : 'bg-warn/70')}
                />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cx(
                        'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg',
                        good ? 'bg-good/12 text-good' : 'bg-warn/12 text-warn',
                      )}
                    >
                      {good ? <CircleCheck className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold leading-snug text-white">{f.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">{f.skill}</p>
                    </div>
                  </div>
                  <TimeChip t={f.timestamp} onClick={(t) => onSeek(Math.max(0, t - 0.5), true)} active={active} />
                </div>

                <p className="mt-3 text-sm leading-relaxed text-slate-300">{f.observation}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  <span className="font-medium text-slate-300">Why it matters: </span>
                  {f.why}
                </p>

                {f.tryThis && (
                  <div className="mt-3 flex gap-2.5 rounded-xl border border-accent-500/25 bg-accent-500/[0.07] p-3 text-sm leading-relaxed text-slate-200">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" aria-hidden />
                    <p>
                      <span className="font-medium text-accent-200">Try this: </span>
                      {f.tryThis}
                    </p>
                  </div>
                )}

                {f.stepId && (
                  <button
                    type="button"
                    onClick={() => onOpenStep(f.stepId!)}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-300 transition-colors hover:text-accent-200"
                  >
                    See this move in the Visual Beta <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </Card>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
