import { Check, RotateCcw } from 'lucide-react'
import type { View } from '../types'
import { cx } from './ui'

const STEPS: { id: View; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'processing', label: 'Analyse' },
  { id: 'results', label: 'Review' },
]

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#4c1d95" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#logo-g)" />
        <path d="M8 22 L13 15 L17 19 L24 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="9" r="2.4" fill="#fff" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight text-white">
        Climb<span className="text-accent-400">IQ</span>
      </span>
    </span>
  )
}

export function Header({ view, onReset }: { view: View; onReset: () => void }) {
  const current = STEPS.findIndex((s) => s.id === view)

  return (
    <header className="sticky top-0 z-30 border-b bg-ink-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <button type="button" onClick={onReset} aria-label="ClimbIQ home" className="rounded-lg">
          <Logo />
        </button>

        <ol className="hidden items-center gap-2 md:flex" aria-label="Progress">
          {STEPS.map((s, i) => {
            const done = i < current
            const active = i === current
            return (
              <li key={s.id} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
                <span
                  className={cx(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active && 'border-accent-500/50 bg-accent-500/15 text-accent-200',
                    done && 'text-slate-300',
                    !active && !done && 'text-slate-500',
                  )}
                >
                  <span
                    className={cx(
                      'grid h-4 w-4 place-items-center rounded-full font-mono text-[10px]',
                      active ? 'bg-accent-500 text-white' : done ? 'bg-white/15 text-white' : 'bg-white/[0.06]',
                    )}
                  >
                    {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : i + 1}
                  </span>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px w-6 bg-white/10" aria-hidden />}
              </li>
            )
          })}
        </ol>

        <div className="flex w-[130px] justify-end">
          {view !== 'upload' && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-2 rounded-lg border bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              New climb
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
