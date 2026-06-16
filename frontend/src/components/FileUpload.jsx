import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { files as filesApi } from '../services/api'

export default function FileUpload({ projectId, files = [] }) {
  const qc      = useQueryClient()
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [message,   setMessage]   = useState('')

  const mutation = useMutation({
    mutationFn: file => filesApi.upload(projectId, file),
    onSuccess: () => {
      qc.invalidateQueries(['project', projectId])
      setMessage('File uploaded — pipeline queued')
      setUploading(false)
    },
    onError: err => {
      setMessage(err.response?.data?.detail || 'Upload failed')
      setUploading(false)
    },
  })

  function handleFiles(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setMessage('')
    mutation.mutate(file)
  }

  return (
    <div className="space-y-6">
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        <input ref={fileRef} type="file" className="hidden" onChange={handleFiles}
          accept=".mp3,.wav,.m4a,.ogg,.mp4,.mov,.avi,.mkv,.webm,.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" />
        <p className="text-gray-600 font-medium">{uploading ? 'Uploading…' : 'Click to upload a file'}</p>
        <p className="text-gray-400 text-sm mt-1">Audio, video, document, or image</p>
        {message && <p className="mt-3 text-sm text-blue-600">{message}</p>}
      </div>

      {files.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">File</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Type</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {files.map(f => (
                <tr key={f.id}>
                  <td className="px-5 py-3 text-gray-900">{f.filename}</td>
                  <td className="px-5 py-3 text-gray-500 capitalize">{f.file_type}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      f.status === 'complete'   ? 'bg-green-100 text-green-700' :
                      f.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                      f.status === 'queued'     ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'}`}>{f.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
