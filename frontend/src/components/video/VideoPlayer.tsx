import { useRef, useState } from 'react'
import { Play, Pause, X, Maximize } from 'lucide-react'
import { formatDuration } from '@/api/videos'

interface Props {
  publicId: string
  title: string
  onClose: () => void
}

export default function VideoPlayer({ publicId, title, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const togglePlay = () => {
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setPlaying(!playing)
  }

  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime)
    setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    videoRef.current.currentTime = ratio * videoRef.current.duration
  }

  const handleFullscreen = () => {
    videoRef.current?.requestFullscreen?.()
  }

  return (
    <div className="fixed inset-0 z-[400] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <p className="text-white text-sm font-medium truncate flex-1 mr-4">{title}</p>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-[#888]">
          <X className="size-5" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center bg-black" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={`/api/videos/${publicId}/stream`}
          className="max-h-full max-w-full"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          playsInline
        />
      </div>

      <div className="px-4 pt-3 pb-6 bg-black/80">
        <div
          className="h-1 bg-white/20 rounded-full mb-3 cursor-pointer relative"
          onClick={handleSeek}
        >
          <div className="h-1 bg-white rounded-full" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full"
            style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#888] text-xs">{formatDuration(Math.floor(currentTime))}</span>
          <div className="flex items-center gap-6">
            <button onClick={togglePlay} className="p-2 rounded-full hover:bg-white/10 text-white">
              {playing ? <Pause className="size-6 fill-white" /> : <Play className="size-6 fill-white" />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#888] text-xs">{formatDuration(Math.floor(duration))}</span>
            <button onClick={handleFullscreen} className="p-1 text-[#666] hover:text-white">
              <Maximize className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
