import { useState, useEffect, useRef } from 'react'
import { useAudioPlayer } from '@/contexts/AudioPlayerContext'
import { get } from '@/api/client'
import { cn } from '@/lib/utils'

interface LrcLine {
  time: number
  text: string
}

function parseLrc(lrc: string): LrcLine[] {
  return lrc.split('\n').flatMap(line => {
    const m = line.match(/^\[(\d{1,3}):(\d{2})\.(\d{1,3})\](.*)/)
    if (!m) return []
    const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100)
    const text = m[4].trim()
    return text ? [{ time, text }] : []
  })
}

interface LyricsSidePanelProps {
  trackId: string | null
}

export function LyricsSidePanel({ trackId }: LyricsSidePanelProps) {
  const { previewProgress } = useAudioPlayer()
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([])
  const [plainLyrics, setPlainLyrics] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [lastTrackId, setLastTrackId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (!trackId || trackId === lastTrackId) return
    setLastTrackId(trackId)
    setLrcLines([])
    setPlainLyrics([])
    setLoading(true)

    get<{ lyrics: string; synced_lyrics: string }>(`/api/tracks/${trackId}/lyrics`)
      .then(data => {
        if (data.synced_lyrics) {
          const parsed = parseLrc(data.synced_lyrics)
          if (parsed.length > 0) {
            setLrcLines(parsed)
            return
          }
        }
        if (data.lyrics) {
          setPlainLyrics(data.lyrics.split('\n').filter(Boolean))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [trackId, lastTrackId])

  // Find active line
  const activeIdx = lrcLines.length > 0
    ? lrcLines.reduce((best, line, i) => {
        if (line.time <= previewProgress) return i
        return best
      }, -1)
    : -1

  // Auto scroll
  useEffect(() => {
    if (!autoScroll || !activeRef.current || !containerRef.current) return
    activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIdx, autoScroll])

  const hasContent = lrcLines.length > 0 || plainLyrics.length > 0

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
          Lyrics
        </p>
      </div>

      <div
        ref={containerRef}
        onScroll={() => setAutoScroll(false)}
        onMouseLeave={() => setAutoScroll(true)}
        className="flex-1 overflow-y-auto px-6 pb-8 scrollbar-hide"
      >
        {loading && (
          <div className="flex items-center gap-2 text-white/20 text-sm">
            <div className="size-1 rounded-full bg-white/30 animate-pulse" />
            <div className="size-1 rounded-full bg-white/30 animate-pulse delay-100" />
            <div className="size-1 rounded-full bg-white/30 animate-pulse delay-200" />
          </div>
        )}

        {!loading && !hasContent && (
          <p className="text-white/20 text-sm">가사 없음</p>
        )}

        {/* Synced lyrics */}
        {lrcLines.length > 0 && (
          <div className="space-y-5">
            {lrcLines.map((line, i) => {
              const isActive = i === activeIdx
              const isPast = i < activeIdx
              return (
                <div
                  key={i}
                  ref={isActive ? activeRef : undefined}
                  className={cn(
                    'text-[15px] leading-snug transition-all duration-300 cursor-default',
                    isActive
                      ? 'text-white font-semibold scale-[1.02] origin-left'
                      : isPast
                      ? 'text-white/20'
                      : 'text-white/35'
                  )}
                >
                  {line.text}
                </div>
              )
            })}
          </div>
        )}

        {/* Plain lyrics */}
        {lrcLines.length === 0 && plainLyrics.length > 0 && (
          <div className="space-y-3">
            {plainLyrics.map((line, i) => (
              <div key={i} className="text-white/50 text-sm leading-relaxed">
                {line || <br />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
