import type { ReactNode } from 'react'
import { Play } from 'lucide-react'
import { formatTime } from '../lib/video'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-2xl border bg-ink-850/80 shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset,0_12px_32px_-18px_rgb(0_0_0/0.7)] backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-accent-400', className)}>
      {children}
    </p>
  )
}

/** A clickable timestamp that seeks the video. */
export function TimeChip({
  t,
  onClick,
  label,
  active,
}: {
  t: number
  onClick: (t: number) => void
  label?: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(t)}
      title={`Jump to ${formatTime(t)} in the video`}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] leading-none transition-colors',
        active
          ? 'border-accent-500/50 bg-accent-500/20 text-accent-200'
          : 'border-white/10 bg-white/[0.04] text-accent-300 hover:border-accent-500/40 hover:bg-accent-500/15',
      )}
    >
      <Play className="h-2.5 w-2.5 fill-current" aria-hidden />
      {formatTime(t)}
      {label && <span className="font-sans text-slate-400">{label}</span>}
    </button>
  )
}

export function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={cx('h-1.5 overflow-hidden rounded-full bg-white/[0.07]', className)}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent-600 to-accent-400 transition-[width] duration-700"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}
