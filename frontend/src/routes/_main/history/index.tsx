import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getHistory } from '@/api/history'
import type { HistoryItem } from '@/api/history'
import { useAudioPlayer } from '@/contexts/AudioPlayerContext'
import { PlayIcon, ClockIcon } from 'lucide-react'

export const Route = createFileRoute('/_main/history/')({
  component: HistoryPage,
})

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금'
  if (m < 60) return m + '분 전'
  const h = Math.floor(m / 60)
  if (h < 24) return h + '시간 전'
  return Math.floor(h / 24) + '일 전'
}

function HistoryPage() {
  const { play } = useAudioPlayer()
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: getHistory,
  })

  const handlePlay = (item: HistoryItem) => {
    play({
      id: item.public_id,
      title: item.title,
      artist: item.artist,
      projectName: item.project_name,
      coverUrl: item.cover_url,
    })
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <ClockIcon className="size-6 text-[#858585]" />
          <h1 className="text-2xl font-bold">재생 기록</h1>
        </div>

        {isLoading ? (
          <div className="text-center text-[#555] py-16">불러오는 중...</div>
        ) : history.length === 0 ? (
          <div className="text-center text-[#555] py-16">
            <ClockIcon className="size-12 mx-auto mb-3 opacity-30" />
            <p>재생 기록이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-1">
            {(history as HistoryItem[]).map((item, i) => (
              <div
                key={item.public_id + '_' + i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
                onClick={() => handlePlay(item)}
              >
                <div className="size-10 rounded-lg bg-[#2a2a2a] overflow-hidden flex-shrink-0">
                  {item.cover_url && (
                    <img src={item.cover_url} alt={item.title} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.title}</p>
                  <p className="text-[#858585] text-xs truncate">
                    {item.artist || item.project_name}
                  </p>
                </div>
                <span className="text-[#555] text-xs flex-shrink-0">{timeAgo(item.played_at)}</span>
                <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded-lg transition-all">
                  <PlayIcon className="size-4 fill-white text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
