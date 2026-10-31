import { useCallback, useEffect, useRef, useState } from 'react'

export const SPEEDS = [0.5, 1, 1.5] as const

/**
 * One playback controller for both a real uploaded video and the sample
 * climb (which has no footage, so it runs on a simulated clock).
 */
export function usePlayer(src: string | undefined, fallbackDuration: number) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const timeRef = useRef(0)
  const [time, setTimeState] = useState(0)
  const [duration, setDuration] = useState(fallbackDuration)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const isDemo = !src

  const setTime = useCallback((t: number) => {
    timeRef.current = t
    setTimeState(t)
  }, [])

  // Real video: mirror element state
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return
    const onMeta = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onSeek = () => setTime(v.currentTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onPause)
    v.addEventListener('seeked', onSeek)
    onMeta()
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onPause)
      v.removeEventListener('seeked', onSeek)
    }
  }, [src, setTime])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.playbackRate = speed
  }, [speed, src])

  // Smooth clock while playing (video.timeupdate is too coarse for markers)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      if (isDemo) {
        const dt = (now - last) / 1000
        last = now
        const next = timeRef.current + dt * speed
        if (next >= duration) {
          setTime(duration)
          setPlaying(false)
          return
        }
        setTime(next)
      } else {
        const v = videoRef.current
        if (v) setTime(v.currentTime)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, isDemo, speed, duration, setTime])

  const play = useCallback(() => {
    if (isDemo) {
      if (timeRef.current >= duration - 0.05) setTime(0)
      setPlaying(true)
    } else {
      videoRef.current?.play().catch(() => {})
    }
  }, [isDemo, duration, setTime])

  const pause = useCallback(() => {
    if (isDemo) setPlaying(false)
    else videoRef.current?.pause()
  }, [isDemo])

  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause])

  const seek = useCallback(
    (t: number, autoplay = false) => {
      const clamped = Math.min(Math.max(0, t), duration)
      const v = videoRef.current
      if (!isDemo && v) v.currentTime = clamped
      setTime(clamped)
      if (autoplay) play()
    },
    [duration, isDemo, play, setTime],
  )

  return { videoRef, src, isDemo, time, duration, playing, speed, setSpeed, play, pause, toggle, seek }
}

export type Player = ReturnType<typeof usePlayer>
