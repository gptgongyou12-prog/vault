import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowLeft, Download, Play, Trash2, Loader2, AlertCircle, Film } from 'lucide-react'
import { listVideos, deleteVideo, formatDuration, type VideoItem } from '@/api/videos'
import VideoDownloadModal from '@/components/video/VideoDownloadModal'
import VideoPlayer from '@/components/video/VideoPlayer'

export const Route = createFileRoute('/_main/video-folder/$folderId')({
  component: VideoFolderPage,
})

function VideoFolderPage() {
  const { folderId } = Route.useParams()
  const [showDownload, setShowDownload] = useState(false)
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null)
  const qc = useQueryClient()

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['videos', folderId],
    queryFn: () => listVideos(folderId),
    refetchInterval: (query) => {
      const data = query.state.data as VideoItem[] | undefined
      const hasDownloading = data?.some(v => v.status === 'downloading')
      return hasDownloading ? 3000 : false
    },
  })

  const handleDelete = async (publicId: string) => {
    await deleteVideo(publicId)
    qc.invalidateQueries({ queryKey: ['videos', folderId] })
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
        <button onClick={() => history.back()} className="p-2 rounded-xl hover:bg-white/10 text-[#666]">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Film className="size-5 text-[#666]" />
          <h1 className="text-lg font-medium">비디오 폴더</h1>
        </div>
        <button
          onClick={() => setShowDownload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl text-sm font-medium"
        >
          <Download className="size-4" />
          다운로드
        </button>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-[#555]" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-20">
            <Film className="size-12 mx-auto mb-3 text-[#333]" />
            <p className="text-[#555] text-sm">YouTube URL을 붙여넣어 영상을 다운로드하세요</p>
            <button
              onClick={() => setShowDownload(true)}
              className="mt-4 px-5 py-2.5 bg-white text-black rounded-xl text-sm font-medium"
            >
              첫 영상 다운로드
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {videos.map(video => (
              <div key={video.public_id} className="flex items-center gap-3 p-3 bg-[#171717] rounded-xl border border-white/5">
                <div className="w-20 h-14 rounded-lg bg-[#222] flex-shrink-0 overflow-hidden relative">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="size-5 text-[#444]" />
                    </div>
                  )}
                  {video.duration && (
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                      {formatDuration(video.duration)}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{video.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[#555] text-xs">{video.quality}p</span>
                    {video.has_subtitles && <span className="text-[#555] text-xs">· 자막</span>}
                    {video.status === 'downloading' && (
                      <span className="flex items-center gap-1 text-[#888] text-xs">
                        <Loader2 className="size-3 animate-spin" /> 다운로드 중
                      </span>
                    )}
                    {video.status === 'failed' && (
                      <span className="flex items-center gap-1 text-red-400 text-xs">
                        <AlertCircle className="size-3" /> 실패
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {video.status === 'completed' && (
                    <button
                      onClick={() => setPlayingVideo(video)}
                      className="p-2 rounded-lg hover:bg-white/10 text-[#888] hover:text-white"
                    >
                      <Play className="size-4 fill-current" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(video.public_id)}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-[#555] hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDownload && (
        <VideoDownloadModal folderId={folderId} onClose={() => setShowDownload(false)} />
      )}
      {playingVideo && (
        <VideoPlayer
          publicId={playingVideo.public_id}
          title={playingVideo.title}
          onClose={() => setPlayingVideo(null)}
        />
      )}
    </div>
  )
}
