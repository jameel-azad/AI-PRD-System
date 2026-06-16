import useProjectStore from '../store/projectStore'
import useAuthStore from '../store/authStore'
import useAppStore from '../store/appStore'

export default function TeamView() {
  const viewRole = useAuthStore(s => s.viewRole)
  const { users, roles, changeUserRole, roleById } = useProjectStore()
  const { openModal, showToast } = useAppStore()
  const canManage = viewRole === 'admin'

  return (
    <>
      <div className="section-head">
        <h3>Members</h3>
        {canManage ? (
          <span className="all" style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => openModal('newrole')}>+ New role</button>
            <button className="btn btn-primary btn-sm" style={{ color: '#fff', background: 'var(--accent)' }} onClick={() => openModal('invite')}>+ Invite member</button>
          </span>
        ) : (
          <span className="all" style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>Only Admins can change roles</span>
        )}
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th><th>Last active</th><th></th></tr></thead>
          <tbody>
            {users.map(u => {
              const initials = u.name.split(' ').map(x => x[0]).join('').slice(0, 2)
              const r = roleById(u.role)
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`avatar sm ${u.color}`}>{initials}</span>
                      <strong>{u.name}</strong>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{u.email}</td>
                  <td>
                    {canManage && u.role !== 'client' ? (
                      <select value={u.role} onChange={e => {
                        const newRole = e.target.value
                        const nr = roleById(newRole)
                        changeUserRole(u.id, newRole, nr.label)
                        showToast(`${u.name} is now ${nr.label}`)
                      }} style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: '7px', fontSize: '12.5px', background: 'var(--paper)', color: 'var(--ink)' }}>
                        {roles.filter(r => !r.external).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    ) : (
                      <span className={`badge ${r.badge || 'gray'}`}><span className="dot" />{u.roleLabel}</span>
                    )}
                  </td>
                  <td>
                    {u.status === 'Invited'
                      ? <span className="badge amber"><span className="dot" />Invited</span>
                      : <span className="badge green"><span className="dot" />Active</span>
                    }
                  </td>
                  <td style={{ color: 'var(--ink-soft)', fontSize: '12.5px' }}>{u.last}</td>
                  <td>
                    {canManage && u.role !== 'client' && (
                      <button className="btn btn-danger btn-xs" onClick={() => showToast(`${u.name} suspended`, 'access revoked · audit-logged')}>Suspend</button>
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
          <div className="section-head" style={{ margin: '0 0 4px' }}>
            <h4>What each role can do (RBAC)</h4>
            {canManage && <button className="btn btn-ghost btn-xs all" onClick={() => openModal('newrole')}>+ New role</button>}
          </div>
          {roles.map(r => (
            <div key={r.id} className="switchrow">
              <span>
                <b>{r.label}{!r.builtin && <span className="badge gray" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, marginLeft: '6px' }}>Custom</span>}</b>
                <small>{r.desc}</small>
              </span>
              <span className={`badge ${r.badge || 'gray'}`}><span className="dot" />{users.filter(u => u.role === r.id).length} users</span>
            </div>
          ))}
        </div>
        <div className="set-card">
          <h4>Pending invitations</h4>
          {users.filter(u => u.status === 'Invited').length === 0
            ? <div className="empty" style={{ padding: '18px' }}>No pending invitations.</div>
            : users.filter(u => u.status === 'Invited').map(u => (
              <div key={u.id} className="switchrow">
                <span><b>{u.name}</b><small>{u.email} · invited as {u.roleLabel}</small></span>
                {canManage && <button className="btn btn-ghost btn-xs" onClick={() => showToast(`Invitation resent to ${u.email}`)}>Resend</button>}
              </div>
            ))
          }
        </div>
      </div>
    </>
  )
}
