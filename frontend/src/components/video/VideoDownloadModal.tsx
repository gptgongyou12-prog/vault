import { useState } from 'react'
import { X, Download, Loader2 } from 'lucide-react'
import { startVideoDownload } from '@/api/videos'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  folderId: string
  onClose: () => void
}

const QUALITY_OPTIONS = [
  { value: '360', label: '360p' },
  { value: '480', label: '480p' },
  { value: '720', label: '720p (권장)' },
  { value: '1080', label: '1080p' },
]

export default function VideoDownloadModal({ folderId, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [quality, setQuality] = useState('720')
  const [subtitles, setSubtitles] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError('')
    try {
      await startVideoDownload({ youtube_url: url.trim(), folder_id: folderId, quality, has_subtitles: subtitles })
      qc.invalidateQueries({ queryKey: ['videos', folderId] })
      onClose()
    } catch (err: any) {
      setError(err?.message || '다운로드 시작 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[#111] border border-white/10 rounded-t-2xl sm:rounded-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-medium text-lg">영상 다운로드</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-[#666]">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-[#666] mb-1.5 block">YouTube URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-[#444] outline-none focus:border-white/20"
            />
          </div>

          <div>
            <label className="text-xs text-[#666] mb-1.5 block">화질</label>
            <div className="grid grid-cols-2 gap-2">
              {QUALITY_OPTIONS.map(q => (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => setQuality(q.value)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    quality === q.value
                      ? 'bg-white text-black border-white'
                      : 'bg-[#1a1a1a] text-[#888] border-white/10 hover:border-white/20'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSubtitles(!subtitles)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
              subtitles ? 'bg-white/10 border-white/20 text-white' : 'bg-[#1a1a1a] border-white/10 text-[#666]'
            }`}
          >
            <span className="text-sm">자막 포함 (한국어/영어)</span>
            <div className={`w-10 h-5 rounded-full transition-colors relative ${subtitles ? 'bg-white' : 'bg-[#333]'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-all ${subtitles ? 'left-5' : 'left-0.5'}`} />
            </div>
          </button>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-black font-medium text-sm disabled:opacity-40"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {loading ? '시작 중...' : '다운로드 시작'}
          </button>
        </form>
      </div>
    </div>
  )
}
