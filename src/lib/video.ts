import type { VideoMeta } from '../types'

export const MAX_BYTES = 500 * 1024 * 1024

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatTime(t: number): string {
  const s = Math.max(0, Math.floor(t + 0.0001))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function validateFile(file: File): string | null {
  const looksLikeVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)
  if (!looksLikeVideo) return 'That file is not a video. Please choose an MP4, MOV or WebM recording.'
  if (file.size > MAX_BYTES) return `That video is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`
  if (file.size === 0) return 'That file looks empty. Please choose a different video.'
  return null
}

/** Reads duration and dimensions in the browser. Resolves null if the browser cannot decode the file. */
export function readVideoMeta(url: string): Promise<VideoMeta | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true

    const finish = (meta: VideoMeta | null) => {
      clearTimeout(timer)
      v.onloadedmetadata = null
      v.onerror = null
      v.removeAttribute('src')
      v.load()
      resolve(meta)
    }
    const timer = setTimeout(() => finish(null), 6000)

    v.onloadedmetadata = () =>
      finish(
        Number.isFinite(v.duration) && v.duration > 0
          ? { duration: v.duration, width: v.videoWidth, height: v.videoHeight }
          : null,
      )
    v.onerror = () => finish(null)
    v.src = url
  })
}
