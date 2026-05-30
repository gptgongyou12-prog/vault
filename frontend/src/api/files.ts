import { get, del } from './client'

export interface FileItem {
  id: number
  public_id: string
  name: string
  size: number
  mime_type: string
  created_at: string
}

export async function listFiles(): Promise<FileItem[]> {
  return get<FileItem[]>('/api/files')
}

export function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<FileItem> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    const csrf = document.cookie.match(/csrf_token=([^;]*)/)?.[1] || ''
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/files/upload')
    xhr.setRequestHeader('X-CSRF-Token', decodeURIComponent(csrf))
    xhr.withCredentials = true
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText))
      else reject(new Error('Upload failed: ' + xhr.status))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(form)
  })
}

export function getDownloadUrl(publicId: string): string {
  return '/api/files/' + publicId + '/download'
}

export async function deleteFile(publicId: string): Promise<void> {
  return del<void>('/api/files/' + publicId)
}
