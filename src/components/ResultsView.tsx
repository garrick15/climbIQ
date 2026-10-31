import { useState } from 'react'
import { Clock, Info, Mountain, MessageSquareText, Route, Target, Trophy } from 'lucide-react'
import type { Analysis } from '../types'
import { usePlayer } from '../lib/usePlayer'
import { formatTime } from '../lib/video'
import { FeedbackPanel } from './FeedbackPanel'
import { TrainingPanel } from './TrainingPanel'
import { VideoPanel } from './VideoPanel'
import { VisualBeta } from './VisualBeta'
import { Card, Eyebrow, Meter, cx } from './ui'

type Tab = 'beta' | 'feedback' | 'training'

interface Props {
  analysis: Analysis
  videoUrl?: string
  fileName?: string
}

export function ResultsView({ analysis, videoUrl, fileName }: Props) {
  const player = usePlayer(videoUrl, analysis.climb.durationSec)
  const [tab, setTab] = useState<Tab>('beta')
  const [stepIndex, setStepIndex] = useState(0)

  const improve = analysis.feedback.filter((f) => f.kind === 'improve').length

  const tabs: { id: Tab; label: string; hint: string; icon: typeof Route }[] = [
    { id: 'beta', label: 'Visual Beta', hint: `${analysis.beta.length} moves`, icon: Route },
    { id: 'feedback', label: 'Feedback', hint: `${analysis.feedback.length} notes`, icon: MessageSquareText },
    { id: 'training', label: 'Training Focus', hint: `${analysis.training.length} skills`, icon: Target },
  ]

  const openStep = (stepId: string) => {
    const i = analysis.beta.findIndex((s) => s.id === stepId)
    if (i >= 0) setStepIndex(i)
    setTab('beta')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-accent-500/25 bg-accent-500/[0.07] px-4 py-3 text-[13px] leading-relaxed text-slate-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" aria-hidden />
        <p>
          <span className="font-medium text-accent-200">Interface preview.</span> Everything below is sample data. The
          computer-vision pipeline is not connected yet, so these results do not describe the video you uploaded.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>Analysis complete</Eyebrow>
          <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-white">
            {fileName ?? 'Sample climb'}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
            {[
              { icon: Trophy, text: analysis.climb.outcome },
              { icon: Clock, text: formatTime(analysis.climb.durationSec) },
              { icon: Route, text: `${analysis.climb.moves} moves` },
              { icon: Mountain, text: `${analysis.climb.holdsDetected} holds detected` },
            ].map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1.5 rounded-full border bg-white/[0.04] px-2.5 py-1">
                <Icon className="h-3.5 w-3.5 text-accent-300" aria-hidden />
                {text}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {analysis.metrics.map((m) => (
          <Card key={m.id} className="p-4">
            <p className="text-xs text-slate-400">{m.label}</p>
            <p className="mt-1.5 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular-nums tracking-tight text-white">{m.value}</span>
              <span className="text-xs text-slate-500">/ 100</span>
            </p>
            <Meter value={m.value} className="mt-2.5" />
            <p className="mt-2.5 text-xs leading-snug text-slate-500">{m.note}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20">
          <VideoPanel analysis={analysis} player={player} fileName={fileName} />
        </div>

        <section aria-label="Coaching output">
          <div className="grid grid-cols-3 gap-1 rounded-xl border bg-ink-850 p-1" role="tablist" aria-label="Coaching output">
            {tabs.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={active}
                  aria-controls={`tabpanel-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={cx(
                    'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2.5 transition-colors sm:flex-row sm:gap-2.5',
                    active ? 'bg-accent-600 text-white shadow-[0_6px_20px_-8px_rgb(124_58_237/0.9)]' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className={cx('hidden font-mono text-[10px] md:inline', active ? 'text-white/70' : 'text-slate-600')}>
                    {t.id === 'feedback' ? `${improve} to fix` : t.hint}
                  </span>
                </button>
              )
            })}
          </div>

          <div
            key={tab}
            role="tabpanel"
            id={`tabpanel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="mt-5 animate-fade-in"
          >
            {tab === 'beta' && (
              <VisualBeta
                analysis={analysis}
                stepIndex={stepIndex}
                onStep={setStepIndex}
                onSeek={(t) => player.seek(Math.max(0, t - 0.5), true)}
              />
            )}
            {tab === 'feedback' && (
              <FeedbackPanel analysis={analysis} time={player.time} onSeek={player.seek} onOpenStep={openStep} />
            )}
            {tab === 'training' && <TrainingPanel analysis={analysis} onSeek={player.seek} />}
          </div>
        </section>
      </div>
    </div>
  )
}
