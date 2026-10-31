/**
 * Draws the REAL detected body pose over the video, synced to playback time.
 *
 * This renders the MediaPipe landmarks that `estimatePose` actually measured —
 * it is not a stylised or mock skeleton. It picks the sampled pose frame
 * closest to the current time and draws it as an SVG overlay that scales with
 * the video's object-contain letterboxing.
 */

import { useMemo } from 'react'
import { POSE_CONNECTIONS } from '../lib/pose-estimation'
import type { PoseTrack } from '../lib/pose-estimation'

interface Props {
  track: PoseTrack
  /** current playback time in seconds */
  time: number
  /** rendered video box, used to letterbox the normalised landmarks */
  box: { width: number; height: number }
  className?: string
}

/** Fit a normalised point into an object-contain video box. */
function fit(
  nx: number,
  ny: number,
  video: { w: number; h: number },
  box: { width: number; height: number },
) {
  const scale = Math.min(box.width / video.w, box.height / video.h)
  const dispW = video.w * scale
  const dispH = video.h * scale
  const offX = (box.width - dispW) / 2
  const offY = (box.height - dispH) / 2
  return { x: offX + nx * dispW, y: offY + ny * dispH }
}

export function SkeletonOverlay({ track, time, box, className }: Props) {
  // Nearest sampled frame that actually has landmarks.
  const frame = useMemo(() => {
    let best: (typeof track.frames)[number] | null = null
    let bestD = Infinity
    for (const f of track.frames) {
      if (!f.landmarks) continue
      const d = Math.abs(f.t - time)
      if (d < bestD) {
        bestD = d
        best = f
      }
    }
    // Hide the skeleton if the nearest detected frame is far from `time`.
    return best && Math.abs(best.t - time) <= 1 / Math.max(1, track.fps) + 0.3 ? best : null
  }, [track, time])

  if (!frame?.landmarks || box.width === 0) return null
  const video = { w: track.width, h: track.height }
  const pts = frame.landmarks.map((l) => fit(l.x, l.y, video, box))

  return (
    <svg
      className={className}
      width={box.width}
      height={box.height}
      viewBox={`0 0 ${box.width} ${box.height}`}
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {POSE_CONNECTIONS.map(([a, b], i) => {
        const va = frame.visibility?.[a] ?? 1
        const vb = frame.visibility?.[b] ?? 1
        if (va < 0.3 || vb < 0.3) return null
        return (
          <line
            key={i}
            x1={pts[a].x}
            y1={pts[a].y}
            x2={pts[b].x}
            y2={pts[b].y}
            stroke="#a78bfa"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.9}
          />
        )
      })}
      {pts.map((p, i) => {
        const v = frame.visibility?.[i] ?? 1
        if (v < 0.3) return null
        // only draw the joints we actually use, to keep it clean
        const keyJoints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
        if (!keyJoints.includes(i)) return null
        return <circle key={i} cx={p.x} cy={p.y} r={4} fill="#ddd6fe" stroke="#7c3aed" strokeWidth={1.5} />
      })}
    </svg>
  )
}
