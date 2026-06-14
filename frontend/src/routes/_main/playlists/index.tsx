import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listPlaylists, createPlaylist, deletePlaylist, updatePlaylist,
  getPlaylistTracks, removeTrackFromPlaylist,
} from '@/api/playlists'
import type { PlaylistSummary, PlaylistTrackItem } from '@/api/playlists'
import { useAudioPlayer } from '@/contexts/AudioPlayerContext'
import { ListMusicIcon, PlusIcon, PlayIcon, Trash2Icon, PencilIcon, ChevronLeftIcon } from 'lucide-react'
import { toast } from '@/routes/__root'

export const Route = createFileRoute('/_main/playlists/')({
  component: PlaylistsPage,
})

function formatDuration(sec: number | null): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m + ':' + String(s).padStart(2, '0')
}

function PlaylistsPage() {
  const queryClient = useQueryClient()
  const { play } = useAudioPlayer()
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistSummary | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: listPlaylists,
  })

  const { data: tracks = [] } = useQuery({
    queryKey: ['playlist-tracks', selectedPlaylist?.public_id],
    queryFn: () => selectedPlaylist ? getPlaylistTracks(selectedPlaylist.public_id) : [],
    enabled: !!selectedPlaylist,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createPlaylist(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      setNewName('')
      setShowCreate(false)
      toast.success('플레이리스트 생성됨')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePlaylist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      if (selectedPlaylist) setSelectedPlaylist(null)
      toast.success('삭제됨')
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updatePlaylist(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      setEditingId(null)
      toast.success('이름 변경됨')
    },
  })

  const removeTrackMutation = useMutation({
    mutationFn: ({ playlistId, itemId }: { playlistId: string; itemId: number }) =>
      removeTrackFromPlaylist(playlistId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlist-tracks', selectedPlaylist?.public_id] })
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })

  const playAll = () => {
    if (!tracks.length) return
    const trackList = (tracks as PlaylistTrackItem[]).map(t => ({
      id: t.public_id, title: t.title, artist: t.artist,
      projectName: t.project_name, coverUrl: t.cover_url,
    }))
    play(trackList[0], trackList, true, false, trackList.slice(1))
  }

  if (selectedPlaylist) {
    return (
      <div className="min-h-screen bg-[#111111] text-white p-4 sm:p-8">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => setSelectedPlaylist(null)}
            className="flex items-center gap-1 text-[#858585] hover:text-white mb-6 text-sm transition-colors"
          >
            <ChevronLeftIcon className="size-4" /> 플레이리스트 목록
          </button>

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">{selectedPlaylist.name}</h1>
              <p className="text-[#858585] text-sm mt-1">{(tracks as PlaylistTrackItem[]).length}개 트랙</p>
            </div>
            {(tracks as PlaylistTrackItem[]).length > 0 && (
              <button
                onClick={playAll}
                className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
              >
                <PlayIcon className="size-4 fill-black" /> 전체 재생
              </button>
            )}
          </div>

          {(tracks as PlaylistTrackItem[]).length === 0 ? (
            <div className="text-center text-[#555] py-16">
              <ListMusicIcon className="size-12 mx-auto mb-3 opacity-30" />
              <p>트랙이 없습니다</p>
              <p className="text-xs mt-1">트랙 상세 화면에서 플레이리스트에 추가하세요</p>
            </div>
          ) : (
            <div className="space-y-1">
              {(tracks as PlaylistTrackItem[]).map((track, i) => (
                <div
                  key={track.item_id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <span className="text-[#555] text-xs w-5 text-center flex-shrink-0">{i + 1}</span>
                  <div className="size-9 rounded-lg bg-[#2a2a2a] overflow-hidden flex-shrink-0">
                    {track.cover_url && (
                      <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => play({ id: track.public_id, title: track.title, artist: track.artist, projectName: track.project_name, coverUrl: track.cover_url })}
                  >
                    <p className="text-white text-sm font-medium truncate">{track.title}</p>
                    <p className="text-[#858585] text-xs truncate">{track.artist || track.project_name}</p>
                  </div>
                  <span className="text-[#555] text-xs flex-shrink-0">{formatDuration(track.duration_seconds)}</span>
                  <button
                    onClick={() => removeTrackMutation.mutate({ playlistId: selectedPlaylist.public_id, itemId: track.item_id })}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-[#858585] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <ListMusicIcon className="size-6 text-[#858585]" />
            <h1 className="text-2xl font-bold">플레이리스트</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            <PlusIcon className="size-4" /> 새 플레이리스트
          </button>
        </div>

        {showCreate && (
          <div className="mb-4 flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) createMutation.mutate(newName.trim()); if (e.key === 'Escape') setShowCreate(false) }}
              placeholder="플레이리스트 이름"
              className="flex-1 bg-[#1a1a1a] border border-[#353333] rounded-xl px-4 py-2 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#555]"
            />
            <button
              onClick={() => { if (newName.trim()) createMutation.mutate(newName.trim()) }}
              className="px-4 py-2 bg-white text-black rounded-xl text-sm font-medium hover:bg-gray-200"
            >
              생성
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName('') }}
              className="px-4 py-2 bg-[#1a1a1a] border border-[#353333] rounded-xl text-sm text-[#858585] hover:text-white"
            >
              취소
            </button>
          </div>
        )}

        {(playlists as PlaylistSummary[]).length === 0 ? (
          <div className="text-center text-[#555] py-16">
            <ListMusicIcon className="size-12 mx-auto mb-3 opacity-30" />
            <p>플레이리스트가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(playlists as PlaylistSummary[]).map(pl => (
              <div
                key={pl.public_id}
                className="flex items-center gap-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 hover:border-[#353333] transition-colors group"
              >
                {editingId === pl.public_id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && editName.trim()) renameMutation.mutate({ id: pl.public_id, name: editName.trim() })
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => { if (editName.trim()) renameMutation.mutate({ id: pl.public_id, name: editName.trim() }); else setEditingId(null) }}
                    className="flex-1 bg-transparent border-b border-white text-white text-sm focus:outline-none"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedPlaylist(pl)}>
                    <p className="text-white text-sm font-medium truncate">{pl.name}</p>
                    <p className="text-[#555] text-xs mt-0.5">{pl.track_count}개 트랙</p>
                  </div>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setEditingId(pl.public_id); setEditName(pl.name) }}
                    className="p-1.5 text-[#858585] hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm(pl.name + '을 삭제할까요?')) deleteMutation.mutate(pl.public_id) }}
                    className="p-1.5 text-[#858585] hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
