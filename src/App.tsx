import { useCallback, useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { ProcessingView } from './components/ProcessingView'
import { PhotoProcessingView } from './components/PhotoProcessingView'
import { ResultsView } from './components/ResultsView'
import { UploadView } from './components/UploadView'
import { readVideoMeta, validateFile } from './lib/video'
import type { AnalyseResult } from './lib/analyse'
import type { PhotoBetaResult } from './lib/photo-beta'
import type { Analysis, VideoMeta, View } from './types'

type Mode = 'video' | 'photo'

export default function App() {
  const [view, setView] = useState<View>('upload')
  const [mode, setMode] = useState<Mode>('video')
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string>()
  const [photoUrl, setPhotoUrl] = useState<string>()
  const [routeColor, setRouteColor] = useState<string | undefined>(undefined)
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
    setPhotoUrl(undefined)
    setMeta(null)
    setError(null)
    setRouteColor(undefined)
  }, [releaseUrl])

  // Video selection (validates as a video + reads metadata).
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

  // Photo selection (image file).
  const selectPhoto = useCallback((f: File) => {
    if (!f.type.startsWith('image/')) {
      setError('That is not an image. Please choose a JPG or PNG photo of the wall.')
      return
    }
    setError(null)
    setFile(f)
    setPhotoUrl(URL.createObjectURL(f))
    setMeta(null)
  }, [])

  const reset = useCallback(() => {
    clear()
    setAnalysis(null)
    setPoseTrack(undefined)
    setFallbackReason(null)
    setView('upload')
    window.scrollTo({ top: 0 })
  }, [clear])

  const startAnalysis = () => {
    setMode('video')
    setView('processing')
    window.scrollTo({ top: 0 })
  }

  const startPhotoBeta = (color?: string) => {
    setMode('photo')
    setRouteColor(color)
    setView('processing')
    window.scrollTo({ top: 0 })
  }

  const startDemo = () => {
    clear()
    setMode('video')
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

  const onPhotoDone = useCallback((r: PhotoBetaResult) => {
    setAnalysis(r.analysis)
    setPhotoUrl(r.imageUrl)
    setPoseTrack(undefined)
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

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {view === 'upload' && (
          <UploadView
            file={file}
            videoUrl={videoUrl}
            photoUrl={photoUrl}
            meta={meta}
            error={error}
            onSelect={select}
            onSelectPhoto={selectPhoto}
            onClear={clear}
            onAnalyse={startAnalysis}
            onPhotoBeta={startPhotoBeta}
            onDemo={startDemo}
          />
        )}

        {view === 'processing' && mode === 'video' && (
          <ProcessingView
            file={file ?? undefined}
            videoUrl={videoUrl}
            durationSec={meta?.duration}
            onDone={onDone}
            onCancel={reset}
          />
        )}

        {view === 'processing' && mode === 'photo' && file && (
          <PhotoProcessingView file={file} routeColor={routeColor} onDone={onPhotoDone} onCancel={reset} />
        )}

        {view === 'results' && analysis && (
          <ResultsView
            analysis={analysis}
            videoUrl={mode === 'video' ? videoUrl : undefined}
            photoUrl={mode === 'photo' ? photoUrl : undefined}
            fileName={file?.name}
            fallbackReason={fallbackReason}
            poseTrack={poseTrack}
          />
        )}
      </main>

      <footer className="border-t py-6 text-center text-xs text-slate-600">
        ClimbIQ · AI bouldering coach · pose by MediaPipe · coaching by Muse Spark
      </footer>
    </div>
  )
}
