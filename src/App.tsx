import { useCallback, useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProcessingView } from './components/ProcessingView'
import { ResultsView } from './components/ResultsView'
import { UploadView } from './components/UploadView'
import { readVideoMeta, validateFile } from './lib/video'
import type { AnalyseResult } from './lib/analyse'
import type { Analysis, VideoMeta, View } from './types'

export default function App() {
  const [view, setView] = useState<View>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string>()
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [poseTrack, setPoseTrack] = useState<AnalyseResult['poseTrack']>(undefined)
  const [fallbackReason, setFallbackReason] = useState<string | null>(null)
  const urlRef = useRef<string>(undefined)

  const releaseUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = undefined
  }, [])

  useEffect(() => releaseUrl, [releaseUrl])

  const clear = useCallback(() => {
    releaseUrl()
    setFile(null)
    setVideoUrl(undefined)
    setMeta(null)
    setError(null)
  }, [releaseUrl])

  const select = useCallback(
    async (f: File) => {
      const problem = validateFile(f)
      if (problem) {
        setError(problem)
        return
      }
      releaseUrl()
      const url = URL.createObjectURL(f)
      urlRef.current = url
      setError(null)
      setFile(f)
      setVideoUrl(url)
      setMeta(null)
      const m = await readVideoMeta(url)
      if (urlRef.current === url) setMeta(m)
    },
    [releaseUrl],
  )

  // One-click demo: load the bundled clip and run the REAL pipeline on it, so a
  // judge sees live pose + coaching without touching a file picker. The clip is
  // served from /public (public/demo-climb.mp4).
  const runDemoVideo = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`${import.meta.env.BASE_URL}demo-climb.mp4`)
      if (!res.ok) throw new Error(`demo clip not found (${res.status})`)
      const blob = await res.blob()
      const f = new File([blob], 'demo-climb.mp4', { type: blob.type || 'video/mp4' })
      await select(f)
      setView('processing')
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(
        `Could not load the bundled demo clip. Add public/demo-climb.mp4, or use "Choose a video". (${e instanceof Error ? e.message : 'unknown'})`,
      )
    }
  }, [select])

  const reset = useCallback(() => {
    clear()
    setAnalysis(null)
    setPoseTrack(undefined)
    setFallbackReason(null)
    setView('upload')
    window.scrollTo({ top: 0 })
  }, [clear])

  const startAnalysis = () => {
    setView('processing')
    window.scrollTo({ top: 0 })
  }

  const onDone = useCallback((r: AnalyseResult) => {
    setAnalysis(r.analysis)
    setPoseTrack(r.poseTrack)
    setFallbackReason(r.usedFallback ? (r.fallbackReason ?? null) : null)
    setView('results')
    window.scrollTo({ top: 0 })
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-accent-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Header view={view} onReset={reset} />

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {view === 'upload' && (
          <UploadView
            file={file}
            videoUrl={videoUrl}
            meta={meta}
            error={error}
            onSelect={select}
            onClear={clear}
            onAnalyse={startAnalysis}
            onRunDemoVideo={runDemoVideo}
          />
        )}

        {view === 'processing' && (
          <ProcessingView
            file={file ?? undefined}
            videoUrl={videoUrl}
            durationSec={meta?.duration}
            onDone={onDone}
            onCancel={reset}
          />
        )}

        {view === 'results' && analysis && (
          <ErrorBoundary onReset={reset}>
            <ResultsView
              analysis={analysis}
              videoUrl={videoUrl}
              fileName={file?.name}
              fallbackReason={fallbackReason}
              poseTrack={poseTrack}
            />
          </ErrorBoundary>
        )}
      </main>

      <footer className="border-t py-6 text-center text-xs text-slate-600">
        ClimbIQ · AI bouldering coach · pose by MediaPipe · coaching by Muse Spark
      </footer>
    </div>
  )
}
