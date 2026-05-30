import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listFiles, uploadFile, deleteFile, getDownloadUrl } from '@/api/files'
import type { FileItem } from '@/api/files'
import { UploadIcon, DownloadIcon, Trash2Icon, FileIcon, FolderOpenIcon } from 'lucide-react'
import { toast } from '@/routes/__root'

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

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['files'],
    queryFn: listFiles,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFile(file, (pct) => {
      setUploadProgress(prev => ({ ...prev, [file.name]: pct }))
    }),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
      toast.success('삭제됨')
    },
    onError: () => toast.error('삭제 실패'),
  })

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return
    Array.from(fileList).forEach(f => uploadMutation.mutate(f))
  }, [uploadMutation])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const totalSize = (files as FileItem[]).reduce((acc, f) => acc + f.size, 0)
  const pendingUploads = Object.entries(uploadProgress)

  return (
    <div className="min-h-screen bg-[#111111] text-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">스토리지</h1>
            <p className="text-[#858585] text-sm mt-1">
              {(files as FileItem[]).length}개 파일 · {formatSize(totalSize)}
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            <UploadIcon className="size-4" />
            업로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={[
            'border-2 border-dashed rounded-2xl p-10 text-center mb-6 cursor-pointer transition-colors',
            isDragging ? 'border-white bg-white/5' : 'border-[#353333] hover:border-[#555] hover:bg-white/[0.02]'
          ].join(' ')}
        >
          <FolderOpenIcon className="size-10 mx-auto mb-3 text-[#555]" />
          <p className="text-[#858585] text-sm">파일을 드래그하거나 클릭해서 업로드</p>
          <p className="text-[#555] text-xs mt-1">최대 2GB · 모든 파일 형식</p>
        </div>

        {pendingUploads.length > 0 && (
          <div className="mb-4 space-y-2">
            {pendingUploads.map(([name, pct]) => (
              <div key={name} className="bg-[#1a1a1a] rounded-xl p-3 border border-[#353333]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm truncate max-w-[80%]">{name}</span>
                  <span className="text-xs text-[#858585]">{pct}%</span>
                </div>
                <div className="h-1 bg-[#333] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-200"
                    style={{ width: pct + '%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="text-center text-[#555] py-16">불러오는 중...</div>
        ) : (files as FileItem[]).length === 0 ? (
          <div className="text-center text-[#555] py-16">
            <FileIcon className="size-12 mx-auto mb-3 opacity-30" />
            <p>파일이 없습니다</p>
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
                  <p className="text-[#555] text-xs mt-0.5">
                    {formatSize(file.size)} · {formatDate(file.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    onClick={() => {
                      if (confirm(file.name + '을 삭제할까요?')) {
                        deleteMutation.mutate(file.public_id)
                      }
                    }}
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
