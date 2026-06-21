import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projects as projectsApi } from '../services/api'
import useAuthStore from '../store/authStore'

function Comment({ comment, replies, onReply, onResolve }) {
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState('')

  function submitReply(e) {
    e.preventDefault()
    onReply(comment.id, text)
    setText('')
    setReplying(false)
  }

  return (
    <div className="space-y-3" style={{ opacity: comment.resolved ? 0.6 : 1 }}>
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {String(comment.user_id).slice(-2)}
        </div>
        <div className="flex-1">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-900">User #{comment.user_id}</span>
              <div className="flex items-center gap-2">
                {comment.resolved && (
                  <span className="text-xs text-green-600 font-medium">✓ Resolved</span>
                )}
                <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleString()}</span>
              </div>
            </div>
            <p className="text-sm text-gray-700">{comment.content}</p>
          </div>
          <div className="flex gap-3 mt-1 ml-1">
            {!comment.resolved && (
              <button onClick={() => setReplying(!replying)} className="text-xs text-gray-400 hover:text-blue-600">
                Reply
              </button>
            )}
            {!comment.resolved && onResolve && (
              <button onClick={() => onResolve(comment.id)} className="text-xs text-gray-400 hover:text-green-600">
                Mark resolved
              </button>
            )}
          </div>
        </div>
      </div>

      {replies?.length > 0 && (
        <div className="ml-11 space-y-3">
          {replies.map(r => (
            <div key={r.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {String(r.user_id).slice(-2)}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">User #{r.user_id}</span>
                  <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-700">{r.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {replying && (
        <form onSubmit={submitReply} className="ml-11 flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} required
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Write a reply…" autoFocus />
          <button type="submit" className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700">Reply</button>
        </form>
      )}
    </div>
  )
}

export default function DiscussionThread({ projectId }) {
  const qc   = useQueryClient()
  const user = useAuthStore(s => s.user)
  const [text, setText] = useState('')

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['comments', projectId],
    queryFn:  () => projectsApi.comments(projectId).then(r => r.data),
  })

  const addMutation = useMutation({
    mutationFn: data => projectsApi.addComment(projectId, data),
    onSuccess:  () => { qc.invalidateQueries(['comments', projectId]); setText('') },
  })

  const resolveMutation = useMutation({
    mutationFn: commentId => projectsApi.resolveComment(projectId, commentId),
    onSuccess:  () => qc.invalidateQueries(['comments', projectId]),
  })

  const roots   = comments.filter(c => !c.parent_id)
  const replies = id => comments.filter(c => c.parent_id === id)

  function handleSubmit(e) {
    e.preventDefault()
    addMutation.mutate({ content: text })
  }

  function handleReply(parentId, content) {
    addMutation.mutate({ content, parent_id: parentId })
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {user?.name?.[0] || '?'}
        </div>
        <div className="flex-1 flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} required
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Add a comment or question…" />
          <button type="submit" disabled={addMutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            Post
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading discussion…</div>
      ) : roots.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">No comments yet — start the discussion</div>
      ) : (
        <div className="space-y-5">
          {roots.map(c => (
            <Comment
              key={c.id}
              comment={c}
              replies={replies(c.id)}
              onReply={handleReply}
              onResolve={resolveMutation.mutate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
