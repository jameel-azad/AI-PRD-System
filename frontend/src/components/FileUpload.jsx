import { useRef, useState, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { files as filesApi, queue as queueApi } from '../services/api'

const STATUS_LABELS = {
  queued:     { text: 'Queued',     cls: 'bg-blue-100 text-blue-700' },
  processing: { text: 'Processing', cls: 'bg-yellow-100 text-yellow-700' },
  retrying:   { text: 'Retrying',   cls: 'bg-orange-100 text-orange-700' },
  complete:   { text: 'Complete',   cls: 'bg-green-100 text-green-700' },
  failed:     { text: 'Failed',     cls: 'bg-red-100 text-red-700' },
  cancelled:  { text: 'Cancelled',  cls: 'bg-gray-100 text-gray-600' },
}

const EXT_SIZE_LIMITS = {
  mp3: 500, wav: 500, m4a: 500, ogg: 500,         // audio: 500MB
  mp4: 1000, mov: 1000, avi: 1000, mkv: 1000, webm: 1000, // video: 1GB
  pdf: 50, docx: 50, txt: 50, md: 50,             // docs: 50MB
  png: 20, jpg: 20, jpeg: 20, webp: 20,           // images: 20MB
}

function checkFileSize(file) {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const limitMB = EXT_SIZE_LIMITS[ext] ?? 500
  if (file.size > limitMB * 1_000_000) {
    return `File too large — max ${limitMB} MB for .${ext} files`
  }
  return null
}

function useTaskPoller(taskId, onDone) {
  useEffect(() => {
    if (!taskId) return
    let stopped = false

    async function poll() {
      try {
        const { data } = await queueApi.taskStatus(taskId)
        if (stopped) return
        if (data.status === 'complete' || data.status === 'failed' || data.status === 'cancelled') {
          onDone(data.status)
          return
        }
        setTimeout(poll, 3000)
      } catch {
        if (!stopped) setTimeout(poll, 5000)
      }
    }

    poll()
    return () => { stopped = true }
  }, [taskId, onDone])
}

export default function FileUpload({ projectId, files = [] }) {
  const qc      = useQueryClient()
  const fileRef = useRef()
  const [uploading,  setUploading]  = useState(false)
  const [uploadPct,  setUploadPct]  = useState(0)
  const [message,    setMessage]    = useState('')
  const [taskId,     setTaskId]     = useState(null)
  const [taskStatus, setTaskStatus] = useState(null)

  const handleDone = useCallback(status => {
    setTaskStatus(status)
    setMessage(status === 'complete' ? 'Pipeline complete — PRD ready' : `Pipeline ${status}`)
    qc.invalidateQueries(['project', projectId])
    setTaskId(null)
  }, [qc, projectId])

  useTaskPoller(taskId, handleDone)

  const mutation = useMutation({
    mutationFn: ({ file, onProgress }) => filesApi.upload(projectId, file, onProgress),
    onSuccess: res => {
      setMessage('File uploaded — processing queued')
      setUploading(false)
      setUploadPct(0)
      if (res.data.task_id) {
        setTaskId(res.data.task_id)
        setTaskStatus('queued')
      }
      qc.invalidateQueries(['project', projectId])
    },
    onError: err => {
      setMessage(err.response?.data?.detail || 'Upload failed')
      setUploading(false)
      setUploadPct(0)
    },
  })

  function handleFiles(e) {
    const file = e.target.files[0]
    if (!file) return
    const sizeError = checkFileSize(file)
    if (sizeError) {
      setMessage(sizeError)
      e.target.value = ''
      return
    }
    setUploading(true)
    setUploadPct(0)
    setMessage('')
    setTaskId(null)
    setTaskStatus(null)
    mutation.mutate({ file, onProgress: pct => setUploadPct(pct) })
    e.target.value = ''
  }

  const pipelineLabel = taskStatus ? (STATUS_LABELS[taskStatus] || { text: taskStatus, cls: 'bg-gray-100 text-gray-600' }) : null
  const isPolling = !!taskId

  return (
    <div className="space-y-6">
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        style={uploading ? { cursor: 'default', opacity: 0.8 } : {}}
      >
        <input ref={fileRef} type="file" className="hidden" onChange={handleFiles} disabled={uploading}
          accept=".mp3,.wav,.m4a,.ogg,.mp4,.mov,.avi,.mkv,.webm,.pdf,.docx,.txt,.md" />
        <p className="text-gray-600 font-medium">
          {uploading ? (uploadPct < 100 ? `Uploading — ${uploadPct}%` : 'Processing…') : 'Click to upload a file'}
        </p>
        <p className="text-gray-400 text-sm mt-1">Audio, video, or document (PDF, DOCX, TXT)</p>
        {uploading && (
          <div className="mt-3 mx-auto" style={{ maxWidth: '240px' }}>
            <div style={{ height: '4px', background: '#E5E7EB', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#3B82F6', borderRadius: '2px', width: `${uploadPct}%`, transition: 'width 0.15s ease' }} />
            </div>
          </div>
        )}
        {message && !uploading && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {isPolling && <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />}
            <p className="text-sm text-blue-600">{message}</p>
          </div>
        )}
        {pipelineLabel && !uploading && (
          <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium ${pipelineLabel.cls}`}>
            {pipelineLabel.text}
          </span>
        )}
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
