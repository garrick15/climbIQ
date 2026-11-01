import { useEffect, useMemo, useState } from 'react'
import { Clock, Info, Mountain, MessageSquareText, Route, Trophy } from 'lucide-react'
import type { Analysis } from '../types'
import { usePlayer } from '../lib/usePlayer'
import { formatTime } from '../lib/video'
import type { PoseTrack } from '../lib/pose-estimation'
import { FeedbackPanel } from './FeedbackPanel'
import { VideoPanel } from './VideoPanel'
import { MoveCoachPanel } from './MoveCoachPanel'
import { Card, Eyebrow, Meter, cx } from './ui'

type Tab = 'beta' | 'feedback'

interface Props {
  analysis: Analysis
  videoUrl?: string
  fileName?: string
  fallbackReason?: string | null
  poseTrack?: PoseTrack
}

export function ResultsView({ analysis, videoUrl, fileName, fallbackReason, poseTrack }: Props) {
  const player = usePlayer(videoUrl, analysis.climb.durationSec)
  const [tab, setTab] = useState<Tab>('beta')
  const [stepIndex, setStepIndex] = useState(0)
  // When true, the Visual Beta follows the video; a manual move pick pauses it.
  const [followVideo, setFollowVideo] = useState(true)

  // The beta move that matches the current playback time (last move whose
  // timestamp has been reached). This is what keeps the wall in sync with the
  // video the user is watching.
  const timeStep = useMemo(() => {
    let idx = 0
    analysis.beta.forEach((s, i) => {
      if (s.timestamp <= player.time + 0.15) idx = i
    })
    return idx
  }, [analysis.beta, player.time])

  // While following, drive the wall from the video's time.
  useEffect(() => {
    if (followVideo && timeStep !== stepIndex) setStepIndex(timeStep)
  }, [followVideo, timeStep, stepIndex])

  // Resume following once the video plays again.
  useEffect(() => {
    if (player.playing) setFollowVideo(true)
  }, [player.playing])

  const improve = analysis.feedback.filter((f) => f.kind === 'improve').length

  const tabs: { id: Tab; label: string; hint: string; icon: typeof Route }[] = [
    { id: 'beta', label: 'Visual Beta', hint: `${analysis.beta.length} moves`, icon: Route },
    { id: 'feedback', label: 'Feedback', hint: `${analysis.feedback.length} notes`, icon: MessageSquareText },
  ]

  const openStep = (stepId: string) => {
    const i = analysis.beta.findIndex((s) => s.id === stepId)
    if (i >= 0) {
      setFollowVideo(false)
      setStepIndex(i)
      const ts = analysis.beta[i]?.timestamp
      if (typeof ts === 'number') player.seek(Math.max(0, ts), false)
    }
    setTab('beta')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="animate-fade-up">
      {analysis.source === 'ai' ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-good/25 bg-good/[0.07] px-4 py-3 text-[13px] leading-relaxed text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden />
          <p>
            <span className="font-medium text-good">Live analysis of your climb.</span> Body pose was tracked with
            MediaPipe
            {analysis.provenance ? ` (detected in ${Math.round(analysis.provenance.poseDetectionRate * 100)}% of sampled frames)` : ''}
            ; the coaching is Muse Spark interpreting that movement.{' '}
            {analysis.provenance?.holdsDetected ? (
              <>
                Holds were detected with SAM&nbsp;3.1 (<em>approximate</em>). Beta is a <em>suggested</em> sequence.
              </>
            ) : (
              <>
                Beta is a <em>suggested</em> sequence and target holds are approximate — automatic hold detection found
                too few holds on this clip, so targets are placed from your hand positions.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/[0.08] px-4 py-3 text-[13px] leading-relaxed text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <p>
            <span className="font-medium text-warn">Sample data.</span>{' '}
            {fallbackReason ??
              'This is a labelled demo climb — not an analysis of a real upload. Upload a video with an API key configured to see live results.'}
          </p>
        </div>
      )}

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
              {
                icon: Mountain,
                text:
                  analysis.source === 'ai'
                    ? analysis.provenance?.holdsDetected
                      ? `${analysis.holds.length} holds detected`
                      : `${analysis.holds.length} suggested targets`
                    : `${analysis.climb.holdsDetected} holds detected`,
              },
            ].map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1.5 rounded-full border bg-white/[0.04] px-2.5 py-1">
                <Icon className="h-3.5 w-3.5 text-accent-300" aria-hidden />
                {text}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tab switch: watch the annotated climb (Visual Beta) or read Feedback. */}
      <div className="mt-6 inline-flex rounded-xl border bg-ink-850 p-1" role="tablist" aria-label="Coaching output">
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
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                active ? 'bg-accent-600 text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
              <span className={cx('font-mono text-[10px]', active ? 'text-white/70' : 'text-slate-600')}>
                {t.id === 'feedback' ? `${improve} to fix` : t.hint}
              </span>
            </button>
          )
        })}
      </div>

      {tab === 'beta' ? (
        // Centrepiece: the annotated footage (left) + per-move coach panel (right).
        <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="lg:sticky lg:top-20">
            <VideoPanel analysis={analysis} player={player} fileName={fileName} poseTrack={poseTrack} />
          </div>
          <section aria-label="Move coaching" className="animate-fade-in">
            <MoveCoachPanel
              analysis={analysis}
              stepIndex={stepIndex}
              onStep={(i) => {
                setFollowVideo(false)
                setStepIndex(i)
                const ts = analysis.beta[i]?.timestamp
                if (typeof ts === 'number') player.seek(Math.max(0, ts), false)
              }}
            />
          </section>
        </div>
      ) : (
        <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-20">
            <VideoPanel analysis={analysis} player={player} fileName={fileName} poseTrack={poseTrack} />
          </div>
          <section aria-label="Feedback" className="animate-fade-in">
            <FeedbackPanel analysis={analysis} time={player.time} onSeek={player.seek} onOpenStep={openStep} />
          </section>
        </div>
      )}

      {/* Metric strip along the bottom (like the mockup). */}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
    </div>
  )
}
