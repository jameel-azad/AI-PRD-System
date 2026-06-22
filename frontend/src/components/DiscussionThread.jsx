import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projects as projectsApi } from '../services/api'
import useAuthStore from '../store/authStore'

const PRD_SECTIONS = [
  '§1 Project Overview',
  '§2 Business Objectives & Success Metrics',
  '§3 Stakeholders & User Personas',
  '§4 Scope (In / Out)',
  '§5 Functional Requirements',
  '§6 Non-Functional Requirements',
  '§7 User Stories / Use Cases',
  '§8 Technical Constraints & Integrations',
  '§9 Data Requirements',
  '§10 Timeline & Milestones',
  '§11 Assumptions & Dependencies',
  '§12 Open Questions & Follow-ups',
  '§13 Glossary',
  '§14 Source Index',
]

const ROLE_LABELS = { admin: 'Admin', ba_pm: 'BA / PM', client: 'Client Reviewer' }
const ROLE_BADGE  = { admin: 'violet', ba_pm: 'gray', client: 'teal' }
const AVATAR_COLORS = ['c-teal', 'c-violet', 'c-amber', 'c-red', 'c-blue']

function avatarColor(name) {
  let h = 0
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name) {
  return (name || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today ${t}`
  if (isYesterday) return `Yesterday ${t}`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` ${t}`
}

function ThreadCard({ root, replies, onReply, onResolve, currentUser }) {
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleReply(e) {
    e.preventDefault()
    if (!replyText.trim()) return
    setSubmitting(true)
    await onReply(root.id, replyText.trim())
    setReplyText('')
    setSubmitting(false)
  }

  const sectionLabel = root.section || ''
  const isResolved = root.resolved

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: '12px',
      overflow: 'hidden',
      opacity: isResolved ? 0.6 : 1,
    }}>
      {/* Thread header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
        {sectionLabel ? (
          <span style={{
            fontSize: '11.5px',
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            padding: '3px 10px',
            borderRadius: '20px',
            letterSpacing: '.02em',
          }}>
            {sectionLabel}
          </span>
        ) : <span />}
        {!isResolved && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => onResolve(root.id)}
            style={{ border: '1px solid var(--line)', fontSize: '12px' }}
          >
            Resolve
          </button>
        )}
        {isResolved && (
          <span style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 500 }}>✓ Resolved</span>
        )}
      </div>

      {/* Root comment */}
      <CommentRow comment={root} />

      {/* Replies */}
      {replies.map(r => (
        <div key={r.id} style={{ borderTop: '1px solid var(--line)', marginLeft: '52px' }}>
          <CommentRow comment={r} isReply />
        </div>
      ))}

      {/* Reply composer */}
      {!isResolved && (
        <div style={{ borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px' }}>
          <span className={`avatar xs ${avatarColor(currentUser?.name)}`}>
            {initials(currentUser?.name)}
          </span>
          <form onSubmit={handleReply} style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Reply…"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '13.5px',
                color: 'var(--ink)',
              }}
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" style={{ cursor: 'pointer', flexShrink: 0 }} />
            <button
              type="submit"
              disabled={submitting || !replyText.trim()}
              className="btn btn-primary btn-xs"
            >
              Reply
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function CommentRow({ comment, isReply = false }) {
  const roleVal  = comment.user_role || 'ba_pm'
  const roleLabel = ROLE_LABELS[roleVal] || roleVal
  const badgeCls  = ROLE_BADGE[roleVal] || 'gray'
  const color     = avatarColor(comment.user_name)

  return (
    <div style={{ display: 'flex', gap: '12px', padding: isReply ? '12px 16px 12px 0' : '14px 16px' }}>
      <span className={`avatar ${isReply ? 'xs' : 'sm'} ${color}`} style={{ flexShrink: 0 }}>
        {initials(comment.user_name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
          <strong style={{ fontSize: '13.5px' }}>{comment.user_name || 'Unknown'}</strong>
          <span className={`badge ${badgeCls}`} style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {roleLabel}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
            {fmtTime(comment.created_at)}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: 'var(--ink)', wordBreak: 'break-word' }}>
          {comment.content}
        </p>
      </div>
    </div>
  )
}

export default function DiscussionThread({ projectId }) {
  const qc   = useQueryClient()
  const user = useAuthStore(s => s.user)

  const [section, setSection] = useState(PRD_SECTIONS[0])
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

  function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    addMutation.mutate({ content: text.trim(), section })
  }

  async function handleReply(parentId, content) {
    await addMutation.mutateAsync({ content, parent_id: parentId })
  }

  const roots   = comments.filter(c => !c.parent_id)
  const repliesFor = id => comments.filter(c => c.parent_id === id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* New thread composer */}
      <div style={{ border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden', background: 'var(--surface)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Start a new comment thread
          </p>
          <div style={{ position: 'relative' }}>
            <select
              value={section}
              onChange={e => setSection(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 36px 10px 14px',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                background: 'var(--paper)',
                color: 'var(--ink)',
                fontSize: '13.5px',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              {PRD_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <svg style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type your comment… use @name to mention someone"
            rows={3}
            style={{
              width: '100%',
              padding: '14px 16px',
              border: 'none',
              background: 'transparent',
              color: 'var(--ink)',
              fontSize: '13.5px',
              resize: 'vertical',
              outline: 'none',
              lineHeight: 1.55,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={addMutation.isPending || !text.trim()}
            >
              {addMutation.isPending ? 'Posting…' : 'Post comment'}
            </button>
          </div>
        </form>
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-soft)', fontSize: '13px' }}>
          Loading discussion…
        </div>
      ) : roots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-soft)', fontSize: '13px' }}>
          No comments yet — start the discussion
        </div>
      ) : (
        roots.map(c => (
          <ThreadCard
            key={c.id}
            root={c}
            replies={repliesFor(c.id)}
            onReply={handleReply}
            onResolve={resolveMutation.mutate}
            currentUser={user}
          />
        ))
      )}
    </div>
  )
}
