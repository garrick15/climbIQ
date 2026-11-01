/**
 * Draws a recognizable climbing-hold glyph for a given hold type, centred at
 * (cx, cy) and sized by rx/ry. Each type has a distinct silhouette + shading so
 * jug / crimp / sloper / pinch / pocket / edge / sidepull / gaston / undercling
 * / foothold / volume read at a glance, like the common hold chart.
 */

import type { HoldType } from '../types'
import { HOLD_COLOR } from '../lib/holdTypes'

interface Props {
  type: HoldType
  cx: number
  cy: number
  rx: number
  ry: number
  rot?: number
  /** override the type's default colour */
  color?: string
  /** dim non-target holds */
  opacity?: number
  highlighted?: boolean
}

/** Lighten/darken a hex colour for simple shading. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amt))
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt))
  const b = Math.min(255, Math.max(0, (n & 255) + amt))
  return `rgb(${r},${g},${b})`
}

export function HoldShape({ type, cx, cy, rx, ry, rot = 0, color, opacity = 1, highlighted }: Props) {
  const base = color ?? HOLD_COLOR[type]
  const light = shade(base, 55)
  const dark = shade(base, -45)
  const gid = `hg-${type}-${Math.round(cx)}-${Math.round(cy)}`

  // Work in a local box of ±rx, ±ry; a group transform places/rotates it.
  const glyph = (() => {
    switch (type) {
      case 'jug':
        // chunky incut blob
        return (
          <path
            d={`M${-rx} ${ry * 0.3} Q${-rx} ${-ry} 0 ${-ry} Q${rx} ${-ry} ${rx} ${ry * 0.2} Q${rx * 0.5} ${ry} 0 ${ry} Q${-rx * 0.6} ${ry} ${-rx} ${ry * 0.3} Z`}
            fill={`url(#${gid})`}
          />
        )
      case 'crimp':
        // thin flat edge
        return <rect x={-rx} y={-ry * 0.45} width={rx * 2} height={ry * 0.9} rx={ry * 0.35} fill={`url(#${gid})`} />
      case 'edge':
        // wider flat ledge with a lip
        return (
          <path
            d={`M${-rx} ${ry * 0.4} L${-rx * 0.9} ${-ry * 0.5} Q0 ${-ry} ${rx * 0.9} ${-ry * 0.5} L${rx} ${ry * 0.4} Q0 ${ry} ${-rx} ${ry * 0.4} Z`}
            fill={`url(#${gid})`}
          />
        )
      case 'sloper':
        // big dome
        return <circle r={Math.max(rx, ry)} fill={`url(#${gid})`} />
      case 'pinch':
        // tall rounded wedge
        return (
          <path
            d={`M0 ${-ry} Q${rx} ${-ry * 0.3} ${rx * 0.6} ${ry} L${-rx * 0.6} ${ry} Q${-rx} ${-ry * 0.3} 0 ${-ry} Z`}
            fill={`url(#${gid})`}
          />
        )
      case 'pocket':
        // ring with a hole
        return (
          <g>
            <circle r={Math.max(rx, ry)} fill={`url(#${gid})`} />
            <circle r={Math.max(rx, ry) * 0.42} fill={dark} />
          </g>
        )
      case 'sidepull':
        // vertical curved bar
        return (
          <path
            d={`M${-rx * 0.5} ${-ry} Q${rx * 0.6} ${-ry * 0.5} ${rx * 0.4} ${ry} Q${-rx * 0.4} ${ry * 0.6} ${-rx * 0.5} ${-ry} Z`}
            fill={`url(#${gid})`}
          />
        )
      case 'gaston':
        // curved mound (sidepull pushed) — hump
        return (
          <path
            d={`M${-rx} ${ry * 0.5} Q${-rx * 0.4} ${-ry} ${rx * 0.3} ${-ry * 0.6} Q${rx} ${-ry * 0.2} ${rx} ${ry * 0.5} Q0 ${ry} ${-rx} ${ry * 0.5} Z`}
            fill={`url(#${gid})`}
          />
        )
      case 'undercling':
        // mound gripped from below — flat bottom, rounded top
        return (
          <path
            d={`M${-rx} ${ry * 0.5} Q${-rx} ${-ry} 0 ${-ry} Q${rx} ${-ry} ${rx} ${ry * 0.5} L${rx} ${ry * 0.5} L${-rx} ${ry * 0.5} Z`}
            fill={`url(#${gid})`}
          />
        )
      case 'volume':
        // large triangular feature
        return (
          <path
            d={`M0 ${-ry} L${rx} ${ry * 0.8} L${-rx} ${ry * 0.8} Z`}
            fill={`url(#${gid})`}
            strokeLinejoin="round"
          />
        )
      case 'foothold':
        // tiny chip
        return <circle r={Math.max(rx, ry) * 0.8} fill={`url(#${gid})`} />
      default:
        return <ellipse rx={rx} ry={ry} fill={`url(#${gid})`} />
    }
  })()

  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rot})`} opacity={opacity}>
      <defs>
        <radialGradient id={gid} cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor={light} />
          <stop offset="60%" stopColor={base} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      </defs>
      {glyph}
      {/* bolt dimple, like the chart photos */}
      {type !== 'foothold' && type !== 'crimp' && (
        <circle r={Math.min(rx, ry) * 0.16 + 0.6} fill="rgba(0,0,0,0.45)" />
      )}
      {highlighted && (
        <ellipse
          className="svg-pulse"
          rx={Math.max(rx, ry) + 6}
          ry={Math.max(rx, ry) + 6}
          fill="none"
          stroke="#ede9fe"
          strokeWidth={1.6}
        />
      )}
    </g>
  )
}
