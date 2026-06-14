import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listFiles, uploadFile, deleteFile, getDownloadUrl } from '@/api/files'
import type { FileItem } from '@/api/files'
import { UploadIcon, DownloadIcon, Trash2Icon, FileIcon, FolderOpenIcon, FolderIcon, FolderPlusIcon, ChevronRightIcon, HomeIcon, PencilIcon, MoveRightIcon, Film } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from '@/routes/__root'
import { get, post, put, del } from '@/api/client'

interface FileFolderItem {
  id: number
  public_id: string
  name: string
  parent_id: number | null
  folder_type: string
  created_at: string
}

function useFolders() {
  return useQuery<FileFolderItem[]>({
    queryKey: ['file-folders'],
    queryFn: () => get<FileFolderItem[]>('/api/file-folders'),
  })
}

export const Route = createFileRoute('/_main/storage/')({
  component: StoragePage,
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function getFileEmoji(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType.startsWith('audio/')) return '🎵'
  if (mimeType.includes('pdf')) return '📄'
  if (mimeType.includes('zip') || mimeType.includes('rar')) return '🗜️'
  return '📁'
}

function StoragePage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [movingFile, setMovingFile] = useState<FileItem | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<FileFolderItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showFolderTypeMenu, setShowFolderTypeMenu] = useState(false)
  const [newFolderType, setNewFolderType] = useState<'normal' | 'video'>('normal')
  const navigate = useNavigate()

  const { data: allFolders = [] } = useFolders()
  const folders = (allFolders as FileFolderItem[]).filter(f => f.parent_id === currentFolderId)

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['files', currentFolderId],
    queryFn: () => listFiles(currentFolderId === null ? undefined : String(currentFolderId)),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFile(file,
      (pct) => setUploadProgress(prev => ({ ...prev, [file.name]: pct })),
      currentFolderId
    ),
    onSuccess: (_data, file) => {
      setUploadProgress(prev => { const n = { ...prev }; delete n[file.name]; return n })
      queryClient.invalidateQueries({ queryKey: ['files'] })
      toast.success('업로드 완료')
    },
    onError: (_err, file) => {
      setUploadProgress(prev => { const n = { ...prev }; delete n[file.name]; return n })
      toast.error('업로드 실패')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteFile,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['files'] }); toast.success('삭제됨') },
    onError: () => toast.error('삭제 실패'),
  })

  const createFolderMutation = useMutation({
    mutationFn: ({ name, type }: { name: string; type: string }) => post<FileFolderItem>('/api/file-folders', { name, parent_id: currentFolderId, folder_type: type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-folders'] })
      setNewFolderName(''); setShowNewFolder(false)
      toast.success('폴더 생성됨')
    },
  })

  const deleteFolderMutation = useMutation({
    mutationFn: (publicId: string) => del<void>('/api/file-folders/' + publicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-folders'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
      toast.success('폴더 삭제됨')
    },
  })

  const renameFolderMutation = useMutation({
    mutationFn: ({ publicId, name }: { publicId: string; name: string }) =>
      put<void>('/api/file-folders/' + publicId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-folders'] })
      setRenamingFolder(null)
      toast.success('이름 변경됨')
    },
  })

  const moveMutation = useMutation({
    mutationFn: ({ filePublicId, folderId }: { filePublicId: string; folderId: number | null }) =>
      put<void>('/api/files/' + filePublicId + '/move', { folder_id: folderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
      setMovingFile(null)
      toast.success('이동됨')
    },
  })

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return
    Array.from(fileList).forEach(f => uploadMutation.mutate(f))
  }, [uploadMutation])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  // 브레드크럼
  const buildBreadcrumb = (): FileFolderItem[] => {
    if (currentFolderId === null) return []
    const path: FileFolderItem[] = []
    let id: number | null = currentFolderId
    while (id !== null) {
      const folder = (allFolders as FileFolderItem[]).find(f => f.id === id)
      if (!folder) break
      path.unshift(folder)
      id = folder.parent_id
    }
    return path
  }
  const breadcrumb = buildBreadcrumb()

  const totalSize = (files as FileItem[]).reduce((acc, f) => acc + f.size, 0)
  const pendingUploads = Object.entries(uploadProgress)

  return (
    <div className="min-h-screen bg-[#111111] text-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">스토리지</h1>
            <p className="text-[#858585] text-sm mt-1">
              {(files as FileItem[]).length}개 파일 · {formatSize(totalSize)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowFolderTypeMenu(!showFolderTypeMenu)}
                className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#353333] text-white rounded-xl text-sm hover:border-[#555] transition-colors"
              >
                <FolderPlusIcon className="size-4" /> 폴더
              </button>
              {showFolderTypeMenu && (
                <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-[#333] rounded-xl overflow-hidden z-50 w-36">
                  <button
                    onClick={() => { setNewFolderType('normal'); setShowFolderTypeMenu(false); setShowNewFolder(true) }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-white hover:bg-white/5"
                  >
                    <FolderIcon className="size-4 text-amber-400" /> 일반 폴더
                  </button>
                  <button
                    onClick={() => { setNewFolderType('video'); setShowFolderTypeMenu(false); setShowNewFolder(true) }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-white hover:bg-white/5"
                  >
                    <Film className="size-4 text-blue-400" /> 비디오 폴더
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
            >
              <UploadIcon className="size-4" /> 업로드
            </button>
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
        </div>

        {/* 브레드크럼 */}
        <div className="flex items-center gap-1.5 mb-4 text-sm overflow-x-auto">
          <button
            onClick={() => setCurrentFolderId(null)}
            className="flex items-center gap-1 text-[#858585] hover:text-white transition-colors flex-shrink-0"
          >
            <HomeIcon className="size-3.5" /> 루트
          </button>
          {breadcrumb.map(folder => (
            <div key={folder.id} className="flex items-center gap-1.5 flex-shrink-0">
              <ChevronRightIcon className="size-3.5 text-[#444]" />
              <button
                onClick={() => setCurrentFolderId(folder.id)}
                className="text-[#858585] hover:text-white transition-colors truncate max-w-[120px]"
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        {/* 새 폴더 입력 */}
        {showNewFolder && (
          <div className="mb-4 flex gap-2">
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newFolderName.trim()) createFolderMutation.mutate({ name: newFolderName.trim(), type: newFolderType })
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
              }}
              placeholder="폴더 이름"
              className="flex-1 bg-[#1a1a1a] border border-[#353333] rounded-xl px-4 py-2 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#555]"
            />
            <button onClick={() => { if (newFolderName.trim()) createFolderMutation.mutate({ name: newFolderName.trim(), type: newFolderType }) }} className="px-4 py-2 bg-white text-black rounded-xl text-sm font-medium">생성</button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} className="px-4 py-2 bg-[#1a1a1a] border border-[#353333] rounded-xl text-sm text-[#858585]">취소</button>
          </div>
        )}

        {/* 드래그 앤 드롭 */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={['border-2 border-dashed rounded-2xl p-8 text-center mb-4 cursor-pointer transition-colors',
            isDragging ? 'border-white bg-white/5' : 'border-[#353333] hover:border-[#555] hover:bg-white/[0.02]'].join(' ')}
        >
          <FolderOpenIcon className="size-8 mx-auto mb-2 text-[#555]" />
          <p className="text-[#858585] text-sm">파일을 드래그하거나 클릭해서 업로드</p>
          <p className="text-[#555] text-xs mt-0.5">최대 2GB</p>
        </div>

        {/* 업로드 진행 중 */}
        {pendingUploads.length > 0 && (
          <div className="mb-4 space-y-2">
            {pendingUploads.map(([name, pct]) => (
              <div key={name} className="bg-[#1a1a1a] rounded-xl p-3 border border-[#353333]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm truncate max-w-[80%]">{name}</span>
                  <span className="text-xs text-[#858585]">{pct}%</span>
                </div>
                <div className="h-1 bg-[#333] rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full transition-all duration-200" style={{ width: pct + '%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 이동 모달 */}
        {movingFile && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setMovingFile(null)}>
            <div className="bg-[#1a1a1a] border border-[#353333] rounded-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold mb-4">이동: {movingFile.name}</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                <button
                  onClick={() => moveMutation.mutate({ filePublicId: movingFile.public_id, folderId: null })}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-left"
                >
                  <HomeIcon className="size-4 text-[#858585]" /> 루트
                </button>
                {(allFolders as FileFolderItem[]).map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => moveMutation.mutate({ filePublicId: movingFile.public_id, folderId: folder.id })}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-left"
                  >
                    <FolderIcon className="size-4 text-amber-400" /> {folder.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 폴더 목록 */}
        {folders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
            {folders.map(folder => (
              <div
                key={folder.id}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 hover:border-[#353333] transition-colors group"
              >
                {renamingFolder?.id === folder.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && renameValue.trim()) renameFolderMutation.mutate({ publicId: folder.public_id, name: renameValue.trim() })
                      if (e.key === 'Escape') setRenamingFolder(null)
                    }}
                    onBlur={() => { if (renameValue.trim()) renameFolderMutation.mutate({ publicId: folder.public_id, name: renameValue.trim() }); else setRenamingFolder(null) }}
                    className="w-full bg-transparent border-b border-white text-sm text-white focus:outline-none"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <div className="cursor-pointer" onClick={() => {
                    if (folder.folder_type === 'video') {
                      navigate({ to: '/video-folder/' + folder.public_id })
                    } else {
                      setCurrentFolderId(folder.id)
                    }
                  }}>
                    {folder.folder_type === 'video'
                      ? <Film className="size-8 text-blue-400 mb-1.5" />
                      : <FolderIcon className="size-8 text-amber-400 mb-1.5" />
                    }
                    <p className="text-white text-sm truncate">{folder.name}</p>
                    {folder.folder_type === 'video' && <p className="text-[#555] text-xs mt-0.5">비디오</p>}
                  </div>
                )}
                <div className="flex gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setRenamingFolder(folder); setRenameValue(folder.name) }}
                    className="p-1 text-[#555] hover:text-white rounded transition-colors"
                  >
                    <PencilIcon className="size-3" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm(folder.name + ' 폴더를 삭제할까요? 파일은 루트로 이동됩니다.')) deleteFolderMutation.mutate(folder.public_id) }}
                    className="p-1 text-[#555] hover:text-red-400 rounded transition-colors"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 파일 목록 */}
        {isLoading ? (
          <div className="text-center text-[#555] py-12">불러오는 중...</div>
        ) : (files as FileItem[]).length === 0 && folders.length === 0 ? (
          <div className="text-center text-[#555] py-12">
            <FileIcon className="size-10 mx-auto mb-3 opacity-30" />
            <p>비어 있습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(files as FileItem[]).map((file) => (
              <div
                key={file.public_id}
                className="flex items-center gap-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 hover:border-[#353333] transition-colors group"
              >
                <span className="text-2xl flex-shrink-0">{getFileEmoji(file.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{file.name}</p>
                  <p className="text-[#555] text-xs mt-0.5">{formatSize(file.size)} · {formatDate(file.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setMovingFile(file)}
                    className="p-2 text-[#858585] hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                    title="이동"
                  >
                    <MoveRightIcon className="size-4" />
                  </button>
                  <a
                    href={getDownloadUrl(file.public_id)}
                    download={file.name}
                    onClick={e => e.stopPropagation()}
                    className="p-2 text-[#858585] hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                    title="다운로드"
                  >
                    <DownloadIcon className="size-4" />
                  </a>
                  <button
                    onClick={() => { if (confirm(file.name + '을 삭제할까요?')) deleteMutation.mutate(file.public_id) }}
                    className="p-2 text-[#858585] hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-colors"
                    title="삭제"
                  >
                    <Trash2Icon className="size-4" />
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
