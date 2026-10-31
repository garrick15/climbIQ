/**
 * Real body-pose estimation with MediaPipe Tasks Vision.
 *
 * This runs entirely in the browser. It samples frames from the uploaded
 * <video> element and detects 33 body landmarks per frame with the MediaPipe
 * PoseLandmarker. The result is a time-series of normalised landmarks that
 * `movement.ts` turns into measurable observations, and that the skeleton
 * overlay draws on top of the video.
 *
 * Nothing here is mocked — if MediaPipe cannot load or no person is found,
 * callers fall back to clearly-labelled demo data.
 */

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/** MediaPipe BlazePose 33-landmark indices we care about. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const

/** The skeleton connections we draw (pairs of landmark indices). */
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso sides
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
]

export interface PoseFrame {
  /** seconds into the video */
  t: number
  /** 33 landmarks, normalised to 0–1 in image space; null if no person found */
  landmarks: NormalizedLandmark[] | null
  /** per-landmark visibility 0–1, parallel to `landmarks` */
  visibility: number[] | null
}

export interface PoseTrack {
  frames: PoseFrame[]
  fps: number
  width: number
  height: number
  /** fraction of sampled frames in which a person was detected, 0–1 */
  detectionRate: number
}

export interface PoseProgress {
  done: number
  total: number
}

// Hosted WASM + model assets. Pinned versions keep the build reproducible.
const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

let landmarkerPromise: Promise<PoseLandmarker> | null = null

/** Lazily create a single PoseLandmarker configured for VIDEO mode. */
async function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
    })().catch((e) => {
      landmarkerPromise = null // allow a retry on next call
      throw e
    })
  }
  return landmarkerPromise
}

/** Seek a video element and resolve once the target frame is ready to draw. */
function seekTo(video: HTMLVideoElement, t: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Video seek failed'))
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      signal.removeEventListener('abort', onAbort)
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    signal.addEventListener('abort', onAbort, { once: true })
    video.currentTime = Math.min(t, video.duration || t)
  })
}

export interface EstimateOptions {
  /** how many frames per second to sample (not the video's own fps) */
  sampleFps?: number
  /** cap on total sampled frames, to bound runtime on long clips */
  maxFrames?: number
  signal: AbortSignal
  onProgress?: (p: PoseProgress) => void
}

/**
 * Run pose estimation across an uploaded video.
 *
 * Decodes the file into an offscreen <video>, steps through it at `sampleFps`,
 * and detects landmarks on each sampled frame.
 */
export async function estimatePose(
  file: File,
  opts: EstimateOptions,
): Promise<PoseTrack> {
  const { signal, onProgress } = opts
  const sampleFps = opts.sampleFps ?? 8
  const maxFrames = opts.maxFrames ?? 160

  const landmarker = await getLandmarker()

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Could not decode this video in the browser.'))
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
        once: true,
      })
    })

    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Video has no readable duration.')
    }

    const width = video.videoWidth
    const height = video.videoHeight

    // Choose a frame count that respects both sampleFps and the cap.
    const ideal = Math.max(2, Math.round(duration * sampleFps))
    const count = Math.min(ideal, maxFrames)
    const step = duration / count

    // Canvas we draw each sampled frame onto before detection.
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas 2D context unavailable.')

    const frames: PoseFrame[] = []
    let detected = 0

    for (let i = 0; i < count; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const t = Math.min(duration - 0.001, i * step + step / 2)
      await seekTo(video, t, signal)
      ctx.drawImage(video, 0, 0, width, height)

      // VIDEO mode needs a monotonically increasing timestamp in ms.
      const result = landmarker.detectForVideo(canvas, Math.round(t * 1000))
      const lm = result.landmarks?.[0] ?? null
      if (lm) detected++

      frames.push({
        t,
        landmarks: lm,
        visibility: lm ? lm.map((p) => p.visibility ?? 0) : null,
      })

      onProgress?.({ done: i + 1, total: count })
    }

    return {
      frames,
      fps: sampleFps,
      width,
      height,
      detectionRate: frames.length ? detected / frames.length : 0,
    }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/** Free the cached landmarker (e.g. on unmount) to release GPU/WASM memory. */
export function disposePose(): void {
  if (landmarkerPromise) {
    landmarkerPromise.then((l) => l.close()).catch(() => {})
    landmarkerPromise = null
  }
}
