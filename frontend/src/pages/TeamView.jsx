import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import useAuthStore from '../store/authStore'
import useAppStore from '../store/appStore'
import { auth as authApi } from '../services/api'

const ROLE_LABELS = { admin: 'Admin', ba_pm: 'BA / PM', client: 'Client Reviewer' }
const AVATAR_COLORS = ['teal', 'violet', 'amber', 'red', 'blue']

function getInitials(name) {
  return (name || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
}

function avatarColor(name) {
  let h = 0
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function relTime(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function InviteForm({ onClose }) {
  const qc = useQueryClient()
  const { showToast } = useAppStore()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ba_pm' })

  const mutation = useMutation({
    mutationFn: () => authApi.createUser(form),
    onSuccess: () => {
      qc.invalidateQueries(['team-users'])
      showToast(`${form.name} has been added to the workspace`)
      onClose()
    },
    onError: err => showToast(err.response?.data?.detail || 'Failed to create user', 'error'),
  })

  function field(key, label, type = 'text') {
    return (
      <div className="field">
        <label>{label}</label>
        <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: '9px', background: 'var(--paper)', color: 'var(--ink)' }} />
      </div>
    )
  }

  return (
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-h"><h3>Add team member</h3></div>
      <div className="modal-b">
        {field('name', 'Full name')}
        {field('email', 'Email address', 'email')}
        {field('password', 'Temporary password', 'password')}
        <div className="field">
          <label>Role</label>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: '9px', background: 'var(--paper)', color: 'var(--ink)' }}>
            <option value="ba_pm">BA / PM</option>
            <option value="admin">Admin</option>
            <option value="client">Client Reviewer</option>
          </select>
        </div>
      </div>
      <div className="modal-f">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Adding…' : 'Add member'}
        </button>
      </div>
    </div>
  )
}

function InviteLinkModal({ onClose }) {
  const { showToast } = useAppStore()
  const [role, setRole] = useState('ba_pm')
  const [link, setLink] = useState(null)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    try {
      const { data } = await authApi.generateInvite(role)
      setLink(data.url)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to generate invite link', 'error')
    } finally {
      setLoading(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(link)
    showToast('Invite link copied to clipboard')
  }

  return (
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-h"><h3>Generate invite link</h3></div>
      <div className="modal-b">
        {!link ? (
          <>
            <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: '13px' }}>
              Generate a single-use invite link (valid 72 hours). The recipient can self-register with the selected role.
            </p>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: '9px', background: 'var(--paper)', color: 'var(--ink)' }}>
                <option value="ba_pm">BA / PM</option>
                <option value="client">Client Reviewer</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 10px', color: 'var(--ink-soft)', fontSize: '13px' }}>
              Share this link. It expires in 72 hours and can only be used once.
            </p>
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '9px', padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: '11px', wordBreak: 'break-all', color: 'var(--ink)' }}>
              {link}
            </div>
          </>
        )}
      </div>
      <div className="modal-f">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        {!link
          ? <button className="btn btn-primary" disabled={loading} onClick={generate}>{loading ? 'Generating…' : 'Generate link'}</button>
          : <button className="btn btn-primary" onClick={copyLink}>Copy link</button>
        }
      </div>
    </div>
  )
}

export default function TeamView() {
  const currentUser = useAuthStore(s => s.user)
  const { showToast } = useAppStore()
  const qc = useQueryClient()
  const [inviting, setInviting] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['team-users'],
    queryFn:  () => authApi.users().then(r => r.data),
  })

  const roleChangeMutation = useMutation({
    mutationFn: ({ id, role }) => authApi.updateUserRole(id, role),
    onSuccess: (_, { role }) => {
      qc.invalidateQueries(['team-users'])
      showToast(`Role updated to ${ROLE_LABELS[role] || role}`)
    },
    onError: err => showToast(err.response?.data?.detail || 'Role update failed', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: id => authApi.deleteUser(id),
    onSuccess: () => { qc.invalidateQueries(['team-users']); showToast('Member removed from workspace') },
    onError: err => showToast(err.response?.data?.detail || 'Remove failed', 'error'),
  })

  if (isLoading) return <div style={{ padding: '40px', color: 'var(--ink-soft)' }}>Loading team…</div>
  if (error)     return <div style={{ padding: '40px', color: 'var(--red)' }}>Failed to load team members. Make sure you have admin access.</div>

  const internal = users.filter(u => (u.role?.value || u.role) !== 'client')
  const clients  = users.filter(u => (u.role?.value || u.role) === 'client')

  function MemberRow({ u }) {
    const isSelf   = u.id === currentUser?.id
    const roleVal  = u.role?.value || u.role
    const isClient = roleVal === 'client'
    const color    = avatarColor(u.name)

    return (
      <tr>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`avatar sm c-${color}`}>{getInitials(u.name)}</span>
            <strong>
              {u.name}
              {isSelf && <span style={{ fontWeight: 400, color: 'var(--ink-soft)', marginLeft: 6 }}>(you)</span>}
            </strong>
          </div>
        </td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ink-soft)' }}>{u.email}</td>
        <td>
          {isClient ? (
            <span className="badge teal" style={{ fontSize: '11px', letterSpacing: '.04em', textTransform: 'uppercase' }}>
              <span className="dot" />Client Reviewer
            </span>
          ) : !isSelf ? (
            <select
              value={roleVal}
              disabled={roleChangeMutation.isPending}
              onChange={e => roleChangeMutation.mutate({ id: u.id, role: e.target.value })}
              style={{ padding: '5px 10px', border: '1px solid var(--line)', borderRadius: '7px', fontSize: '12.5px', background: 'var(--paper)', color: 'var(--ink)', cursor: 'pointer' }}
            >
              <option value="admin">Admin</option>
              <option value="ba_pm">BA / PM</option>
              <option value="client">Client Reviewer</option>
            </select>
          ) : (
            <span className="badge violet"><span className="dot" />{ROLE_LABELS[roleVal] || roleVal}</span>
          )}
        </td>
        <td>
          <span className="badge green"><span className="dot" />Active</span>
        </td>
        <td style={{ color: 'var(--ink-soft)', fontSize: '13px' }}>
          {relTime(u.created_at)}
        </td>
        <td>
          {!isSelf && (
            <button
              className="btn btn-danger btn-xs"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${u.name} from the workspace?`)) {
                  deleteMutation.mutate(u.id)
                }
              }}
            >
              Remove
            </button>
          )}
        </td>
      </tr>
    )
  }

  return (
    <>
      {inviting && (
        <div className="overlay" onClick={() => setInviting(false)}>
          <InviteForm onClose={() => setInviting(false)} />
        </div>
      )}
      {generatingLink && (
        <div className="overlay" onClick={() => setGeneratingLink(false)}>
          <InviteLinkModal onClose={() => setGeneratingLink(false)} />
        </div>
      )}

      <div className="section-head">
        <h3>Members ({users.length})</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setGeneratingLink(true)}>
            Invite link
          </button>
          <button className="btn btn-primary btn-sm" style={{ color: '#fff', background: 'var(--accent)' }} onClick={() => setInviting(true)}>
            + Add member
          </button>
        </div>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {internal.map(u => <MemberRow key={u.id} u={u} />)}
            {clients.length > 0 && internal.length > 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '6px 12px', background: 'var(--paper)', color: 'var(--ink-soft)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--line)' }}>
                  Client Reviewers
                </td>
              </tr>
            )}
            {clients.map(u => <MemberRow key={u.id} u={u} />)}
          </tbody>
        </table>
      </div>

      <div className="set-grid" style={{ marginTop: '20px' }}>
        <div className="set-card">
          <h4>Role permissions</h4>
          {[
            ['admin',  'Admin',          'Full access — manage team, projects, feasibility overrides'],
            ['ba_pm',  'BA / PM',        'Create projects, upload files, advance stages, view all PRDs'],
            ['client', 'Client Reviewer','View assigned project PRD, leave comments, approve/request changes'],
          ].map(([key, label, desc]) => (
            <div key={key} className="switchrow">
              <span><b>{label}</b><small>{desc}</small></span>
              <span className="badge gray">
                <span className="dot" />
                {users.filter(u => (u.role?.value || u.role) === key).length} users
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
