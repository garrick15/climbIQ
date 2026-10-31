/**
 * Extracts a few evenly-spaced frames from a video file as JPEG data URLs.
 * Used to give the coaching model a little visual grounding alongside the
 * numeric pose observations. Runs entirely in the browser.
 */

export async function sampleFrames(
  file: File,
  count: number,
  signal: AbortSignal,
): Promise<string[]> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  const seek = (t: number) =>
    new Promise<void>((resolve, reject) => {
      const onSeeked = () => resolve()
      video.addEventListener('seeked', onSeeked, { once: true })
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
        once: true,
      })
      video.currentTime = Math.min(t, video.duration || t)
    })

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('decode failed'))
    })

    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) return []

    // Downscale frames to keep the request small (long edge ≈ 512px).
    const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight))
    const w = Math.round(video.videoWidth * scale)
    const h = Math.round(video.videoHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return []

    const out: string[] = []
    for (let i = 0; i < count; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const t = (duration * (i + 0.5)) / count
      await seek(t)
      ctx.drawImage(video, 0, 0, w, h)
      out.push(canvas.toDataURL('image/jpeg', 0.7))
    }
    return out
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
