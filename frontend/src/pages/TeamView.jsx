import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import useAuthStore from '../store/authStore'
import useAppStore from '../store/appStore'
import { auth as authApi } from '../services/api'

const ROLE_LABELS = { admin: 'Admin', ba_pm: 'BA / PM', client: 'Client Reviewer' }
const ROLE_BADGE  = { admin: 'violet', ba_pm: 'teal', client: 'green' }

function getInitials(name) {
  return (name || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
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

export default function TeamView() {
  const currentUser = useAuthStore(s => s.user)
  const { showToast } = useAppStore()
  const qc = useQueryClient()
  const [inviting, setInviting] = useState(false)

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
    onSuccess: () => { qc.invalidateQueries(['team-users']); showToast('User removed') },
    onError: err => showToast(err.response?.data?.detail || 'Remove failed', 'error'),
  })

  if (isLoading) return <div style={{ padding: '40px', color: 'var(--ink-soft)' }}>Loading team…</div>
  if (error)     return <div style={{ padding: '40px', color: 'var(--red)' }}>Failed to load team members. Make sure you have admin access.</div>

  return (
    <>
      {inviting && (
        <div className="overlay" onClick={() => setInviting(false)}>
          <InviteForm onClose={() => setInviting(false)} />
        </div>
      )}

      <div className="section-head">
        <h3>Members ({users.length})</h3>
        <button className="btn btn-primary btn-sm" style={{ color: '#fff', background: 'var(--accent)' }} onClick={() => setInviting(true)}>
          + Add member
        </button>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr><th>Member</th><th>Email</th><th>Role</th><th></th></tr>
          </thead>
          <tbody>
            {users.map(u => {
              const initials = getInitials(u.name)
              const isSelf   = u.id === currentUser?.id
              const badge    = ROLE_BADGE[u.role?.value || u.role] || 'gray'
              const roleVal  = u.role?.value || u.role

              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`avatar sm c-teal`}>{initials}</span>
                      <strong>{u.name}{isSelf && <span style={{ fontWeight: 400, color: 'var(--ink-soft)', marginLeft: 6 }}>(you)</span>}</strong>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{u.email}</td>
                  <td>
                    {!isSelf ? (
                      <select value={roleVal} disabled={roleChangeMutation.isPending}
                        onChange={e => roleChangeMutation.mutate({ id: u.id, role: e.target.value })}
                        style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: '7px', fontSize: '12.5px', background: 'var(--paper)', color: 'var(--ink)' }}>
                        <option value="admin">Admin</option>
                        <option value="ba_pm">BA / PM</option>
                        <option value="client">Client Reviewer</option>
                      </select>
                    ) : (
                      <span className={`badge ${badge}`}><span className="dot" />{ROLE_LABELS[roleVal] || roleVal}</span>
                    )}
                  </td>
                  <td>
                    {!isSelf && (
                      <button className="btn btn-danger btn-xs"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove ${u.name} from the workspace?`)) {
                            deleteMutation.mutate(u.id)
                          }
                        }}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="set-grid" style={{ marginTop: '20px' }}>
        <div className="set-card">
          <h4>Role permissions</h4>
          {[
            ['Admin',          'Full access — manage team, projects, feasibility overrides'],
            ['BA / PM',        'Create projects, upload files, advance stages, view all PRDs'],
            ['Client Reviewer','View assigned project PRD, leave comments, approve/request changes'],
          ].map(([role, desc]) => (
            <div key={role} className="switchrow">
              <span><b>{role}</b><small>{desc}</small></span>
              <span className={`badge ${ROLE_BADGE[Object.keys(ROLE_LABELS).find(k => ROLE_LABELS[k] === role)] || 'gray'}`}>
                <span className="dot" />{users.filter(u => (u.role?.value || u.role) === Object.keys(ROLE_LABELS).find(k => ROLE_LABELS[k] === role)).length} users
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
