import { useState } from 'react'
import { ChevronDown, Quote } from 'lucide-react'
import type { Analysis } from '../types'
import { Card, Meter, TimeChip, cx } from './ui'

interface Props {
  analysis: Analysis
  onSeek: (t: number, autoplay?: boolean) => void
}

export function TrainingPanel({ analysis, onSeek }: Props) {
  const [open, setOpen] = useState<string | null>(analysis.training[0]?.id ?? null)

  return (
    <div>
      <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
        Ranked by how much each skill limited your movement in this clip. Start at number one and give it a few
        sessions before moving on.
      </p>

      <ol className="mt-4 space-y-3">
        {analysis.training.map((t) => {
          const isOpen = open === t.id
          return (
            <li key={t.id}>
              <Card className={cx('overflow-hidden', t.rank === 1 && 'border-accent-500/35')}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : t.id)}
                  aria-expanded={isOpen}
                  aria-controls={`panel-${t.id}`}
                  className="flex w-full items-start gap-4 p-5 text-left"
                >
                  <span
                    className={cx(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-xl font-mono text-lg font-medium',
                      t.rank === 1 ? 'bg-accent-600 text-white' : 'bg-white/[0.06] text-slate-300',
                    )}
                    aria-label={`Priority ${t.rank}`}
                  >
                    {t.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-accent-400">{t.skill}</span>
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                          t.impact === 'High' ? 'bg-accent-500/20 text-accent-200' : 'bg-white/[0.07] text-slate-300',
                        )}
                      >
                        {t.impact} impact
                      </span>
                    </span>
                    <span className="mt-1 block text-lg font-semibold tracking-tight text-white">{t.headline}</span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-slate-400">{t.reason}</span>
                    <Meter value={t.impactScore} className="mt-3 max-w-xs" />
                  </span>
                  <ChevronDown
                    className={cx('mt-2 h-5 w-5 shrink-0 text-slate-500 transition-transform', isOpen && 'rotate-180')}
                    aria-hidden
                  />
                </button>

                {isOpen && (
                  <div id={`panel-${t.id}`} className="animate-fade-in border-t px-5 pb-5 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Seen at</span>
                      {t.evidence.map((e) => (
                        <TimeChip
                          key={e.timestamp}
                          t={e.timestamp}
                          label={e.label}
                          onClick={(s) => onSeek(Math.max(0, s - 0.5), true)}
                        />
                      ))}
                    </div>

                    <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-200">
                      <Quote className="h-4 w-4 shrink-0 text-accent-400" aria-hidden />
                      <span className="italic">{t.cue}</span>
                      <span className="ml-auto hidden text-xs not-italic text-slate-500 sm:inline">Cue to repeat</span>
                    </div>

                    <h4 className="mt-5 text-[11px] font-medium uppercase tracking-wider text-slate-500">Drills</h4>
                    <ul className="mt-2 divide-y rounded-xl border">
                      {t.drills.map((d) => (
                        <li key={d.name} className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-start sm:gap-4">
                          <div className="sm:w-44 sm:shrink-0">
                            <p className="text-sm font-medium text-slate-100">{d.name}</p>
                            <p className="mt-1 inline-block rounded-md bg-accent-500/12 px-1.5 py-0.5 font-mono text-[11px] text-accent-300">
                              {d.prescription}
                            </p>
                          </div>
                          <p className="text-sm leading-relaxed text-slate-400">{d.detail}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-slate-500">Suggested pace: {t.cadence}.</p>
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
