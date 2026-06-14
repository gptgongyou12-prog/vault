import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDownIcon, HeartIcon, PlayIcon } from 'lucide-react'
import { useAudioPlayer } from '@/contexts/AudioPlayerContext'
import { LyricsSidePanel } from './LyricsSidePanel'
import { cn } from '@/lib/utils'

interface FullscreenPlayerProps {
  open: boolean
  onClose: () => void
}

export function FullscreenPlayer({ open, onClose }: FullscreenPlayerProps) {
  const { currentTrack } = useAudioPlayer()
  const [tab, setTab] = useState<'player' | 'lyrics'>('player')

  useEffect(() => {
    if (open) setTab('player')
  }, [open, currentTrack?.id])

  if (!currentTrack) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          className="fixed inset-0 z-[200] bg-[#0e0e0e] flex flex-col md:hidden"
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 pt-12 pb-4 shrink-0">
            <button
              onClick={onClose}
              className="p-2 -ml-2 text-white/50 hover:text-white transition-colors"
            >
              <ChevronDownIcon className="size-6" />
            </button>
            <p className="text-white/40 text-xs">재생 중</p>
            <div className="size-10" />
          </div>

          {/* Tabs */}
          <div className="flex px-5 gap-1 mb-6 shrink-0">
            {(['player', 'lyrics'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                  tab === t ? 'bg-white text-black' : 'text-white/40'
                )}
              >
                {t === 'player' ? '플레이어' : '가사'}
              </button>
            ))}
          </div>

          {tab === 'player' ? (
            <PlayerContent />
          ) : (
            <div className="flex-1 overflow-hidden">
              <LyricsSidePanel trackId={currentTrack.id} />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PlayerContent() {
  const {
    currentTrack, isPlaying, pause, resume,
    nextTrack, previousTrack, previewProgress, duration,
    seekTo, loopMode, toggleLoop, isShuffled, toggleShuffle,
  } = useAudioPlayer()

  const progressRef = useRef<HTMLDivElement>(null)

  if (!currentTrack) return null

  const progress = duration > 0 ? (previewProgress / duration) * 100 : 0

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    seekTo(Math.max(0, Math.min(duration, ratio * duration)))
  }

  return (
    <div className="flex-1 flex flex-col px-8 pb-8">
      {/* Album art */}
      <div className="flex-1 flex items-center justify-center py-4">
        <div className="w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden bg-white/8 shadow-2xl">
          {currentTrack.coverUrl ? (
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <PlayIcon className="size-12 text-white/20 fill-white/20" />
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="min-w-0">
          <p className="text-white font-semibold text-xl truncate">{currentTrack.title}</p>
          <p className="text-white/50 text-sm truncate mt-0.5">
            {currentTrack.artist || currentTrack.projectName || '—'}
          </p>
        </div>
        <button className="p-2 text-white/30 hover:text-white transition-colors">
          <HeartIcon className="size-6" />
        </button>
      </div>

      {/* Progress */}
      <div className="mb-5 shrink-0">
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="h-1 bg-white/10 rounded-full cursor-pointer relative mb-2 group"
        >
          <div
            className="absolute inset-y-0 left-0 bg-white rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-white/30 text-xs">
          <span>{fmt(previewProgress)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between shrink-0">
        <button
          onClick={toggleShuffle}
          className={cn('p-2 transition-colors', isShuffled ? 'text-white' : 'text-white/30')}
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </button>
        <button onClick={previousTrack} className="p-2 text-white/70 hover:text-white transition-colors">
          <svg className="size-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>
        <button
          onClick={isPlaying ? pause : resume}
          className="size-16 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          {isPlaying ? (
            <svg className="size-6 text-black" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6zm8-14v14h4V5z" />
            </svg>
          ) : (
            <svg className="size-6 text-black ml-1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button onClick={nextTrack} className="p-2 text-white/70 hover:text-white transition-colors">
          <svg className="size-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm2-8.14 5.5 2.14-5.5 2.14V9.86zM16 6h2v12h-2z" />
          </svg>
        </button>
        <button
          onClick={toggleLoop}
          className={cn('p-2 transition-colors', loopMode !== 'off' ? 'text-white' : 'text-white/30')}
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M17 2l4 4-4 4" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 22l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>
      </div>
    </div>
  )
}
