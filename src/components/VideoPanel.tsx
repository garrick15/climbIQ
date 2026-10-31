import { Film, Pause, Play } from 'lucide-react'
import type { Analysis } from '../types'
import { SPEEDS } from '../lib/usePlayer'
import type { Player } from '../lib/usePlayer'
import { formatTime } from '../lib/video'
import { Card, cx } from './ui'

interface Props {
  analysis: Analysis
  player: Player
  fileName?: string
}

export function VideoPanel({ analysis, player, fileName }: Props) {
  const { time, duration, playing, speed, src } = player
  const pct = duration > 0 ? (time / duration) * 100 : 0

  let stepIdx = -1
  analysis.beta.forEach((s, i) => {
    if (s.timestamp <= time + 0.2) stepIdx = i
  })
  const currentStep = stepIdx >= 0 ? analysis.beta[stepIdx] : undefined

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[3/4] bg-black">
        {src ? (
          <video
            ref={player.videoRef}
            src={src}
            playsInline
            preload="metadata"
            onClick={player.toggle}
            className="h-full w-full cursor-pointer object-contain"
            aria-label={fileName ? `Your climb: ${fileName}` : 'Your climb'}
          />
        ) : (
          <div className="grid-lines absolute inset-0 flex flex-col items-center justify-between bg-[radial-gradient(circle_at_50%_40%,#171d31,#0a0d16_70%)] px-6 pb-8 pt-12 text-center">
            <div>
              <Film className="mx-auto h-7 w-7 text-ink-500" aria-hidden />
              <p className="mt-3 text-sm font-medium text-slate-300">Sample climb</p>
              <p className="mx-auto mt-1 max-w-[220px] text-xs leading-relaxed text-slate-500">
                No footage here. Upload a video to review the analysis against your own climb.
              </p>
            </div>
            <p className="font-mono text-4xl font-medium tabular-nums text-white/90">{formatTime(time)}</p>
          </div>
        )}

        {currentStep && (
          <div className="pointer-events-none absolute left-3 top-3 max-w-[85%] truncate rounded-lg border border-white/10 bg-ink-950/75 px-2.5 py-1.5 text-[11px] text-slate-200 backdrop-blur">
            <span className="font-mono text-accent-300">Move {stepIdx + 1}</span>
            <span className="mx-1.5 text-slate-600">·</span>
            {currentStep.title}
          </div>
        )}

        {!playing && (
          <button
            type="button"
            onClick={player.toggle}
            aria-label="Play"
            className="absolute inset-0 m-auto grid h-14 w-14 place-items-center rounded-full bg-accent-600/90 text-white shadow-[0_8px_30px_-6px_rgb(124_58_237/0.7)] backdrop-blur transition-transform hover:scale-105"
          >
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </button>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="relative h-7">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
          <div
            className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent-500"
            style={{ width: `${pct}%` }}
          />
          {analysis.beta.map((s) => (
            <span
              key={s.id}
              aria-hidden
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/25"
              style={{ left: `${(s.timestamp / duration) * 100}%` }}
            />
          ))}
          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={time}
            onChange={(e) => player.seek(Number(e.target.value))}
            aria-label="Seek"
            className="absolute inset-0 z-0 h-full w-full cursor-pointer opacity-0"
          />
          {analysis.feedback.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => player.seek(Math.max(0, f.timestamp - 0.5), true)}
              title={`${formatTime(f.timestamp)} · ${f.title}`}
              aria-label={`${f.kind === 'strength' ? 'Done well' : 'To improve'} at ${formatTime(f.timestamp)}: ${f.title}`}
              className={cx(
                'absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-850 transition-transform hover:scale-125',
                f.kind === 'strength' ? 'bg-good' : 'bg-warn',
              )}
              style={{ left: `${(f.timestamp / duration) * 100}%` }}
            />
          ))}
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgb(139_92_246/0.35)]"
            style={{ left: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={player.toggle}
              aria-label={playing ? 'Pause' : 'Play'}
              className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.07] text-white transition-colors hover:bg-white/[0.12]"
            >
              {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
            </button>
            <span className="font-mono text-xs tabular-nums text-slate-300">
              {formatTime(time)} <span className="text-slate-600">/</span> {formatTime(duration)}
            </span>
          </div>
          <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => player.setSpeed(s)}
                aria-pressed={speed === s}
                className={cx(
                  'rounded-md px-2 py-1 font-mono text-[11px] transition-colors',
                  speed === s ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-good" /> Done well
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warn" /> To improve
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-px bg-white/30" /> Move
          </span>
        </div>
      </div>
    </Card>
  )
}
