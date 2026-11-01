/**
 * Processing view for the photo → beta flow. Runs the photo pipeline (hold
 * detection, route planning, Muse Spark beta) and shows staged progress.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { PHOTO_PIPELINE, betaFromPhoto } from '../lib/photo-beta'
import type { PhotoBetaResult } from '../lib/photo-beta'
import { Card, Eyebrow, cx } from './ui'

interface Props {
  file: File
  routeColor?: string
  onDone: (r: PhotoBetaResult) => void
  onCancel: () => void
}

export function PhotoProcessingView({ file, routeColor, onDone, onCancel }: Props) {
  const [stage, setStage] = useState(0)
  const [fraction, setFraction] = useState(0)
  const [preview] = useState(() => URL.createObjectURL(file))
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const ctrl = new AbortController()
    betaFromPhoto({
      file,
      routeColor,
      signal: ctrl.signal,
      onProgress: (p) => {
        setStage(p.stage)
        setFraction(p.fraction)
      },
    })
      .then((r) => doneRef.current(r))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) throw e
      })
    return () => {
      ctrl.abort()
      URL.revokeObjectURL(preview)
    }
  }, [file, routeColor, preview])

  const overall = Math.min(100, Math.round(((stage + fraction) / PHOTO_PIPELINE.length) * 100))

  return (
    <div className="animate-fade-up mx-auto grid max-w-5xl items-center gap-8 pt-6 md:grid-cols-[1fr_340px] md:pt-12">
      <div>
        <Eyebrow>Planning your beta</Eyebrow>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Reading the wall</h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-slate-400">
          Detecting the holds{routeColor ? ` on the ${routeColor} route` : ''}, linking them into a route, and asking
          Muse Spark to suggest how to climb it. This is a suggestion from one photo.
        </p>

        <div className="mt-8 flex items-center gap-4">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={overall}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-600 to-accent-400 transition-[width] duration-150 ease-linear"
              style={{ width: `${overall}%` }}
            />
          </div>
          <span className="w-12 text-right font-mono text-sm tabular-nums text-slate-200">{overall}%</span>
        </div>

        <ol className="mt-6 space-y-1.5">
          {PHOTO_PIPELINE.map((s, i) => {
            const done = i < stage
            const active = i === stage
            return (
              <li
                key={s.id}
                className={cx(
                  'flex items-center gap-3.5 rounded-xl border border-transparent px-3.5 py-3 transition-colors',
                  active && 'border-accent-500/30 bg-accent-500/[0.08]',
                )}
              >
                <span
                  className={cx(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full',
                    done ? 'bg-accent-600 text-white' : active ? 'bg-accent-500/20 text-accent-300' : 'bg-white/[0.06] text-slate-600',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="font-mono text-[10px]">{i + 1}</span>}
                </span>
                <span className="min-w-0">
                  <span className={cx('block text-sm font-medium', done || active ? 'text-white' : 'text-slate-500')}>{s.label}</span>
                  <span className={cx('block text-xs', active ? 'text-slate-400' : 'text-slate-600')}>{s.detail}</span>
                </span>
              </li>
            )
          })}
        </ol>

        <button
          type="button"
          onClick={onCancel}
          className="mt-6 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
        >
          <X className="h-4 w-4" aria-hidden /> Cancel
        </button>
      </div>

      <Card className="relative mx-auto aspect-[3/4] w-full max-w-[340px] overflow-hidden">
        <img src={preview} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-ink-950/40" />
        <div
          aria-hidden
          className="absolute inset-x-3 h-px animate-scan bg-gradient-to-r from-transparent via-accent-300 to-transparent shadow-[0_0_18px_4px_rgb(167_139_250/0.55)]"
        />
        <p className="absolute inset-x-0 bottom-5 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-accent-200/80">
          {PHOTO_PIPELINE[Math.min(stage, PHOTO_PIPELINE.length - 1)].label}
        </p>
      </Card>
    </div>
  )
}
