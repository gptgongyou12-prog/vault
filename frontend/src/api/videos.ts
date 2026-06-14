import { get, post, del } from './client'

export interface VideoItem {
  id: number
  public_id: string
  folder_id: number
  title: string
  youtube_url: string
  thumbnail_url: string | null
  duration: number | null
  quality: string
  has_subtitles: boolean
  status: 'downloading' | 'completed' | 'failed'
  error_msg?: string
  created_at: string
}

export interface DownloadRequest {
  youtube_url: string
  folder_id: string
  quality: string
  has_subtitles: boolean
}

export async function startVideoDownload(req: DownloadRequest): Promise<{ public_id: string; status: string }> {
  return post('/api/videos/download', req)
}

export async function listVideos(folderId: string): Promise<VideoItem[]> {
  return get<VideoItem[]>(`/api/videos?folder_id=${folderId}`)
}

export async function getVideoStatus(publicId: string): Promise<VideoItem> {
  return get<VideoItem>(`/api/videos/${publicId}`)
}

export function getVideoStreamUrl(publicId: string): string {
  return `/api/videos/${publicId}/stream`
}

export async function deleteVideo(publicId: string): Promise<void> {
  return del<void>(`/api/videos/${publicId}`)
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
