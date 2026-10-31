/**
 * Copies the MediaPipe Tasks-Vision WASM out of node_modules and downloads the
 * pose model into public/mediapipe/, so the app serves them from its own
 * origin instead of a cross-origin CDN (which gets blocked by CSP/CORS/network
 * policy on deployed sites).
 *
 * Runs automatically on `postinstall` and before `build`. Safe to re-run.
 * Requires network access (your machine / the Netlify build) — it is a no-op
 * failure (warn, don't break the build) if the model download can't complete.
 */

import { cp, mkdir, access, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'mediapipe')
const wasmOut = join(outDir, 'wasm')
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const modelOut = join(outDir, 'pose_landmarker_lite.task')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

const exists = async (p) => {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function copyWasm() {
  if (!(await exists(wasmSrc))) {
    console.warn('[prepare-mediapipe] WASM not found in node_modules; run npm install first. Skipping.')
    return
  }
  await mkdir(wasmOut, { recursive: true })
  await cp(wasmSrc, wasmOut, { recursive: true })
  console.log('[prepare-mediapipe] Copied WASM →', wasmOut)
}

async function downloadModel() {
  if (await exists(modelOut)) {
    const s = await stat(modelOut)
    if (s.size > 100_000) {
      console.log('[prepare-mediapipe] Model already present, skipping download.')
      return
    }
  }
  await mkdir(outDir, { recursive: true })
  console.log('[prepare-mediapipe] Downloading pose model…')
  const res = await fetch(MODEL_URL)
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} fetching model`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(modelOut))
  const s = await stat(modelOut)
  console.log(`[prepare-mediapipe] Saved model → ${modelOut} (${Math.round(s.size / 1024)} KB)`)
}

try {
  await copyWasm()
  await downloadModel()
  console.log('[prepare-mediapipe] Done.')
} catch (e) {
  // Don't fail the build: the app falls back to the CDN if local assets are missing.
  console.warn('[prepare-mediapipe] Could not prepare local assets (will fall back to CDN):', e.message)
}
