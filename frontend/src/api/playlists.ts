import { get, post, put, del } from './client'

export interface PlaylistSummary {
  id: number
  public_id: string
  name: string
  track_count: number
  created_at: string
}

export interface PlaylistTrackItem {
  item_id: number
  position: number
  track_id: number
  public_id: string
  title: string
  artist: string | null
  project_name: string
  cover_url: string | null
  duration_seconds: number | null
}

export async function listPlaylists(): Promise<PlaylistSummary[]> {
  return get<PlaylistSummary[]>('/api/playlists')
}

export async function createPlaylist(name: string): Promise<PlaylistSummary> {
  return post<PlaylistSummary>('/api/playlists', { name })
}

export async function updatePlaylist(publicId: string, name: string): Promise<void> {
  return put<void>('/api/playlists/' + publicId, { name })
}

export async function deletePlaylist(publicId: string): Promise<void> {
  return del<void>('/api/playlists/' + publicId)
}

export async function getPlaylistTracks(publicId: string): Promise<PlaylistTrackItem[]> {
  return get<PlaylistTrackItem[]>('/api/playlists/' + publicId + '/tracks')
}

export async function addTrackToPlaylist(playlistPublicId: string, trackPublicId: string): Promise<{ item_id: number; position: number }> {
  return post('/api/playlists/' + playlistPublicId + '/tracks', { track_public_id: trackPublicId })
}

export async function removeTrackFromPlaylist(playlistPublicId: string, itemId: number): Promise<void> {
  return del<void>('/api/playlists/' + playlistPublicId + '/tracks/' + itemId)
}
