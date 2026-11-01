import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { ArrowRight, Camera, CircleAlert, Film, MessageSquareText, PlayCircle, Route, Sparkles, Target, UploadCloud, X } from 'lucide-react'
import { buildDemoAnalysis } from '../data/demo'
import type { VideoMeta } from '../types'
import { MAX_BYTES, formatBytes, formatTime } from '../lib/video'
import { BetaWall } from './BetaWall'
import { Card, Eyebrow, cx } from './ui'

interface Props {
  file: File | null
  videoUrl?: string
  meta: VideoMeta | null
  error: string | null
  onSelect: (f: File) => void
  onClear: () => void
  onAnalyse: () => void
  onDemo: () => void
  /** run the full real pipeline on the bundled demo clip (no file picker) */
  onRunDemoVideo: () => void
}

const OUTPUTS = [
  { icon: Route, title: 'Visual Beta', text: 'A step-by-step sequence with target holds, movement arrows and body positions.' },
  { icon: MessageSquareText, title: 'Personalised feedback', text: 'What you did well and what to improve, tied to timestamps in your video.' },
  { icon: Target, title: 'Training focus', text: 'Two to three prioritised skills to practise, with drills for each.' },
]

const TIPS = [
  'Film side-on or slightly front-on so your whole body and the wall are in frame.',
  'Keep the camera still and the lighting even. A tripod or a lean-to phone works well.',
  'Record the full attempt from the start holds to the top. 10 seconds to 3 minutes is ideal.',
]

export function UploadView({ file, videoUrl, meta, error, onSelect, onClear, onAnalyse, onDemo, onRunDemoVideo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => setPreviewFailed(false), [videoUrl])

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onSelect(f)
  }

  const long = meta && meta.duration > 180

  return (
    <div className="animate-fade-up">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div>
          <Eyebrow>AI bouldering coach</Eyebrow>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
            See your climb the way a coach does.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
            Upload a recording of a boulder problem. ClimbIQ studies how you move, then shows you a better sequence,
            explains what to fix and tells you what to practise next.
          </p>

          <div className="mt-8">
            {!file ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cx(
                  'group relative rounded-2xl border border-dashed p-8 text-center transition-colors sm:p-10',
                  dragging ? 'border-accent-400 bg-accent-500/10' : 'border-white/15 bg-ink-850/70 hover:border-accent-500/50',
                )}
              >
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-500/15 text-accent-300 transition-transform group-hover:-translate-y-0.5">
                  <UploadCloud className="h-7 w-7" aria-hidden />
                </span>
                <p className="mt-5 text-lg font-medium text-white">Drop your climbing video here</p>
                <p className="mt-1 text-sm text-slate-500">
                  MP4, MOV or WebM · up to {formatBytes(MAX_BYTES)}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={onRunDemoVideo}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgb(124_58_237/0.9)] transition-colors hover:bg-accent-500"
                  >
                    <PlayCircle className="h-4 w-4" aria-hidden /> Run the demo climb
                  </button>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
                  >
                    <Film className="h-4 w-4" aria-hidden /> Choose a video
                  </button>
                  <button
                    type="button"
                    onClick={onDemo}
                    className="inline-flex items-center gap-2 rounded-xl border bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
                  >
                    <Sparkles className="h-4 w-4 text-accent-300" aria-hidden /> Sample data
                  </button>
                </div>
                <p className="mt-3 text-center text-xs text-slate-500">
                  <span className="font-medium text-slate-400">Run the demo climb</span> analyses a bundled clip live
                  (real pose + AI coaching). <span className="font-medium text-slate-400">Sample data</span> shows the
                  interface instantly with no video.
                </p>
              </div>
            ) : (
              <Card className="p-4 sm:p-5">
                <div className="flex gap-4">
                  <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-black sm:h-32 sm:w-24">
                    {videoUrl && !previewFailed ? (
                      <video
                        src={`${videoUrl}#t=0.5`}
                        muted
                        playsInline
                        preload="metadata"
                        onError={() => setPreviewFailed(true)}
                        className="h-full w-full object-cover"
                        aria-hidden
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-slate-600">
                        <Film className="h-6 w-6" aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-[15px] font-medium text-white" title={file.name}>
                        {file.name}
                      </p>
                      <button
                        type="button"
                        onClick={onClear}
                        aria-label="Remove video"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.07] hover:text-slate-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
                      <div className="flex gap-1.5">
                        <dt className="text-slate-600">Size</dt>
                        <dd>{formatBytes(file.size)}</dd>
                      </div>
                      {meta && (
                        <>
                          <div className="flex gap-1.5">
                            <dt className="text-slate-600">Length</dt>
                            <dd>{formatTime(meta.duration)}</dd>
                          </div>
                          <div className="flex gap-1.5">
                            <dt className="text-slate-600">Resolution</dt>
                            <dd>
                              {meta.width}×{meta.height}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                    {previewFailed && (
                      <p className="mt-2 text-xs text-slate-500">
                        Your browser cannot preview this format, but it can still be analysed.
                      </p>
                    )}
                    {long && (
                      <p className="mt-2 text-xs text-warn">
                        This clip is over three minutes. Trimming it to one attempt gives sharper feedback.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-200"
                  >
                    Choose a different video
                  </button>
                  <button
                    type="button"
                    onClick={onAnalyse}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgb(124_58_237/0.9)] transition-colors hover:bg-accent-500"
                  >
                    Analyse my climb <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </Card>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="video/*,.mp4,.mov,.m4v,.webm"
              className="sr-only"
              tabIndex={-1}
              aria-label="Upload climbing video"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onSelect(f)
                e.target.value = ''
              }}
            />

            {error && (
              <p
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3.5 py-3 text-sm text-red-200"
              >
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <p className="mt-3 px-1 text-xs text-slate-500">
              Your video stays in this browser tab. Nothing is uploaded anywhere yet.
            </p>
          </div>
        </div>

        <HeroPreview />
      </div>

      <div className="mt-16 grid gap-4 md:grid-cols-3">
        {OUTPUTS.map(({ icon: Icon, title, text }, i) => (
          <Card key={title} className="p-5">
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-500/15 text-accent-300">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="font-mono text-[11px] text-slate-600">0{i + 1}</span>
            </div>
            <h2 className="mt-4 text-[15px] font-semibold text-white">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <Camera className="h-4 w-4 text-accent-300" aria-hidden />
          <h2 className="text-sm font-semibold text-white">For the best results</h2>
        </div>
        <ul className="mt-3 grid gap-x-8 gap-y-2.5 text-sm leading-relaxed text-slate-400 md:grid-cols-3">
          {TIPS.map((t) => (
            <li key={t} className="flex gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-400" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
/** A small, self-playing example of the Visual Beta output. */
function HeroPreview() {
  const analysis = useMemo(() => buildDemoAnalysis(), [])
  const [i, setI] = useState(4)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setI((n) => (n + 1) % analysis.beta.length), 2600)
    return () => clearInterval(id)
  }, [analysis.beta.length])

  return (
    <div className="mx-auto w-full max-w-[340px] lg:mx-0" aria-hidden>
      <div className="relative">
        <div className="absolute -inset-6 -z-10 rounded-[40px] bg-accent-500/10 blur-3xl" />
        <BetaWall
          holds={analysis.holds}
          steps={analysis.beta}
          stepIndex={i}
          className="w-full rounded-[18px] shadow-[0_30px_70px_-30px_rgb(0_0_0/0.9)]"
        />
      </div>
      <p className="mt-3 flex items-center justify-between gap-3 px-1 text-xs">
        <span className="shrink-0 text-slate-500">Example Visual Beta</span>
        <span className="truncate font-mono text-slate-400">
          {i + 1}/{analysis.beta.length} · {analysis.beta[i].title}
        </span>
      </p>
    </div>
  )
}
