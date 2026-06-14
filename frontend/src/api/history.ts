import { get, post } from './client'

export interface HistoryItem {
  track_id: number
  public_id: string
  title: string
  artist: string | null
  project_name: string
  cover_url: string | null
  played_at: string
}

export async function recordPlay(trackPublicId: string): Promise<void> {
  return post<void>('/api/history', { track_public_id: trackPublicId })
}

export async function getHistory(): Promise<HistoryItem[]> {
  return get<HistoryItem[]>('/api/history')
}
