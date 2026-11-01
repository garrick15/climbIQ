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

/*
 * MediaPipe WASM + model assets.
 *
 * We self-host these from the app's own origin (public/mediapipe/…) so there is
 * no cross-origin fetch to be blocked by CSP, CORS, ad-blockers or network
 * policy — the common cause of "could not create the pose model" on deployed
 * sites. The `scripts/prepare-mediapipe.mjs` step (run on install/build) copies
 * the WASM out of node_modules and downloads the model into public/.
 *
 * If a local asset is missing (e.g. the prepare step didn't run), we fall back
 * to the public CDNs so local `npm run dev` still works.
 */
const LOCAL_WASM_BASE = `${import.meta.env.BASE_URL}mediapipe/wasm`
const LOCAL_MODEL_URL = `${import.meta.env.BASE_URL}mediapipe/pose_landmarker_lite.task`

const CDN_WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
const CDN_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

/** True if a same-origin asset exists (HEAD/GET ok), so we prefer local. */
async function assetExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

let landmarkerPromise: Promise<PoseLandmarker> | null = null

// Monotonic timestamp base shared across the session, so detection timestamps
// are always strictly increasing even across multiple analyses that reuse the
// same landmarker graph (MediaPipe VIDEO mode rejects non-increasing stamps).
let timestampCursor = 0
function nextTimestampBase(): number {
  timestampCursor += 100_000 // leave a big gap between runs
  return timestampCursor
}

/** Lazily create a single PoseLandmarker configured for VIDEO mode. */
async function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      // Prefer self-hosted assets; fall back to CDN if they aren't present.
      const [localWasm, localModel] = await Promise.all([
        assetExists(`${LOCAL_WASM_BASE}/vision_wasm_internal.wasm`),
        assetExists(LOCAL_MODEL_URL),
      ])
      const wasmBase = localWasm ? LOCAL_WASM_BASE : CDN_WASM_BASE
      const modelUrl = localModel ? LOCAL_MODEL_URL : CDN_MODEL_URL
      console.info(
        `[ClimbIQ] MediaPipe assets — wasm: ${localWasm ? 'local' : 'cdn'}, model: ${localModel ? 'local' : 'cdn'}`,
      )

      let fileset
      try {
        fileset = await FilesetResolver.forVisionTasks(wasmBase)
      } catch (e) {
        throw new Error(
          `Could not load the MediaPipe pose engine (WASM) from ${wasmBase}. ` +
            `This is usually a network or content-security-policy block. Original error: ${String(e)}`,
        )
      }

      const create = (delegate: 'GPU' | 'CPU') =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })

      // Prefer GPU, but fall back to CPU where WebGL is unavailable/blocked.
      try {
        return await create('GPU')
      } catch (gpuErr) {
        console.warn('[ClimbIQ] Pose GPU delegate failed, retrying on CPU:', gpuErr)
        try {
          return await create('CPU')
        } catch (cpuErr) {
          throw new Error(
            `Could not create the pose model from ${modelUrl}. GPU and CPU both failed — ` +
              `the model file likely failed to download (check it is served and reachable). ` +
              `Original error: ${String(cpuErr)}`,
          )
        }
      }
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
  /** fires once per analysed frame, for a live view of the analysis */
  onFrame?: (f: LiveFrame) => void
}

/** A normalised bounding box (0–1) around the detected climber. */
export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

/** Snapshot handed to the UI for each frame as analysis runs. */
export interface LiveFrame {
  /** seconds into the video */
  t: number
  /** 0–1 progress through the clip */
  progress: number
  /** downscaled JPEG data URL of the exact frame being analysed */
  image: string
  /** source frame dimensions */
  width: number
  height: number
  /** detected landmarks (normalised), or null if no person this frame */
  landmarks: NormalizedLandmark[] | null
  visibility: number[] | null
  /** tight normalised box around the climber, or null if not detected */
  bbox: BBox | null
}

/** Tight bounding box (normalised) from visible landmarks. */
function landmarksToBBox(lm: NormalizedLandmark[]): BBox | null {
  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  let any = false
  for (const p of lm) {
    if ((p.visibility ?? 0) < 0.3) continue
    any = true
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (!any) return null
  // small padding so the box doesn't clip the body
  const padX = (maxX - minX) * 0.08
  const padY = (maxY - minY) * 0.06
  minX = Math.max(0, minX - padX)
  minY = Math.max(0, minY - padY)
  maxX = Math.min(1, maxX + padX)
  maxY = Math.min(1, maxY + padY)
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
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
  const { signal, onProgress, onFrame } = opts
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

    // Smaller canvas used only to produce the live preview image cheaply.
    const previewScale = onFrame ? Math.min(1, 360 / Math.max(width, height)) : 0
    const preview = onFrame ? document.createElement('canvas') : null
    const pctx = preview ? preview.getContext('2d') : null
    if (preview && pctx) {
      preview.width = Math.round(width * previewScale)
      preview.height = Math.round(height * previewScale)
    }

    const frames: PoseFrame[] = []
    let detected = 0

    // VIDEO mode requires STRICTLY increasing timestamps. We use a dedicated
    // monotonic counter (not the video's own time) so frames never collide or
    // go backwards — even if two sampled times round to the same ms, or the
    // same landmarker instance was used by a previous analysis.
    let ts = nextTimestampBase()

    for (let i = 0; i < count; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const t = Math.min(duration - 0.001, i * step + step / 2)
      await seekTo(video, t, signal)
      ctx.drawImage(video, 0, 0, width, height)

      ts += 50 // ms; any strictly-increasing step works
      const result = landmarker.detectForVideo(canvas, ts)
      const lm = result.landmarks?.[0] ?? null
      if (lm) detected++

      const visibility = lm ? lm.map((p) => p.visibility ?? 0) : null
      frames.push({ t, landmarks: lm, visibility })

      onProgress?.({ done: i + 1, total: count })

      // Emit a live snapshot of this analysed frame for the UI.
      if (onFrame && preview && pctx) {
        pctx.drawImage(video, 0, 0, preview.width, preview.height)
        onFrame({
          t,
          progress: count > 1 ? i / (count - 1) : 1,
          image: preview.toDataURL('image/jpeg', 0.6),
          width,
          height,
          landmarks: lm,
          visibility,
          bbox: lm ? landmarksToBBox(lm) : null,
        })
        // Yield to the event loop so React can paint between frames.
        await new Promise((r) => setTimeout(r, 0))
      }
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
