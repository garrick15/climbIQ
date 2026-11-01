/**
 * Catches render-time exceptions so a bug in one view shows a recoverable
 * message instead of a blank white page.
 */

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  onReset?: () => void
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ClimbIQ] Render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h2 className="text-2xl font-semibold text-white">Something went wrong displaying this</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            The analysis finished, but we hit a snag rendering it. Your data is safe — try again, or start over with a
            different clip.
          </p>
          <p className="mt-2 break-words font-mono text-xs text-slate-600">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null })
              this.props.onReset?.()
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-500"
          >
            Start over
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
