import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useAppStore from '../store/appStore'
import useProjectStore from '../store/projectStore'
import { renderBoldText } from '../utils/renderBoldText'
import { auth as authApi } from '../services/api'

const ROLE_LABELS = {
  admin:  'Admin',
  bapm:   'BA / PM · Internal',
  client: 'Client Reviewer',
}
const ROLE_COLORS = { admin: 'c-violet', bapm: 'c-teal', client: 'c-green' }

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('')
}

const NAV_BAPM = [
  { grp: 'Workspace' },
  { path: '/',                label: 'Dashboard',        icon: 'dashboard' },
  { path: '/projects',        label: 'Projects',         icon: 'files'     },
  { path: '/clarifications',  label: 'Clarifications',   icon: 'question', countKey: 'clars' },
  { path: '/approvals',       label: 'Approvals',        icon: 'check'     },
  { grp: 'Manage' },
  { path: '/clients',         label: 'Clients',          icon: 'users'     },
  { path: '/team',            label: 'Team & roles',     icon: 'team',     adminOnly: true },
  { path: '/settings',        label: 'Settings',         icon: 'settings'  },
]

function buildClientNav(projects) {
  const pid = projects[0]?.id ?? 'medaxis'
  return [
    { grp: 'Your project' },
    { path: `/projects/${pid}/prd`,         label: 'Requirements (PRD)', icon: 'files'  },
    { path: `/projects/${pid}/discussion`,  label: 'Discussion',         icon: 'chat'   },
    { path: `/projects/${pid}/feasibility`, label: 'Feasibility report', icon: 'pulse'  },
  ]
}

function NavIcon({ name }) {
  const icons = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>,
    files:     <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    question:  <><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></>,
    check:     <><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4 12 14l-3-3"/></>,
    users:     <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    team:      <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    chat:      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
    pulse:     <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {icons[name] || null}
    </svg>
  )
}

function NotifPanel({ onClose }) {
  const { notifications, markRead, markAllRead, showToast } = useAppStore()
  const navigate = useNavigate()

  function openNotif(n) {
    markRead(n.id)
    onClose()
    if (n.proj) {
      if (n.type === 'comment') navigate(`/projects/${n.proj}/discussion`)
      else if (n.type === 'sanction') navigate(`/projects/${n.proj}/feasibility`)
      else navigate(`/projects/${n.proj}`)
    }
  }

  const tone = { comment: 'var(--blue-soft)', gap: 'var(--blue-soft)', sanction: 'var(--red-soft)', approve: 'var(--green-soft)', deadline: 'var(--amber-soft)', assign: 'var(--accent-soft)' }

  return (
    <div className="notif-panel">
      <div className="notif-head">
        <h3>Notifications</h3>
        <button onClick={() => { markAllRead(); showToast('All notifications marked read') }}>Mark all read</button>
      </div>
      <div className="notif-list">
        {notifications.map(n => (
          <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => openNotif(n)}>
            <span className="nico" style={{ background: tone[n.type] || 'var(--paper)' }}>{n.icon}</span>
            <span className="ntext">{renderBoldText(n.text)}<div className="ntime">{n.time}</div></span>
          </div>
        ))}
      </div>
      <div className="notif-foot"><button onClick={onClose}>Close</button></div>
    </div>
  )
}

function RoleMenu({ onClose }) {
  const viewRole = useAuthStore(s => s.viewRole)
  const setViewRole = useAuthStore(s => s.setViewRole)
  const { showToast } = useAppStore()
  const navigate = useNavigate()
  const projects = useProjectStore(s => s.projects)

  function setRole(r) {
    setViewRole(r)
    onClose()
    const lbl = r === 'admin' ? 'Admin' : r === 'client' ? 'Client Reviewer' : 'BA / PM'
    showToast(`Now viewing as ${lbl}`, r === 'client' ? 'client portal · limited to their project' : 'role-based access applied')
    if (r === 'client') {
      const pid = projects[0]?.id ?? 'medaxis'
      navigate(`/projects/${pid}/prd`)
    } else {
      navigate('/')
    }
  }

  const items = [
    { role: 'admin',  label: 'Admin',           sub: 'Full access · override blockers',     icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></> },
    { role: 'bapm',   label: 'BA / PM',          sub: 'Build & submit PRDs',                 icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></> },
    { role: 'client', label: 'Client Reviewer',  sub: 'Review, comment, approve',            icon: <><path d="M20 21v-2a4 4 0 0 0-3-3.9M9 21H4v-2a4 4 0 0 1 4-4h4"/><circle cx="12" cy="7" r="4"/></> },
  ]

  return (
    <div className="dropdown">
      <div className="dd-h">Switch perspective</div>
      {items.map(it => (
        <button key={it.role} className={`dd-item ${viewRole === it.role ? 'cur' : ''}`} onClick={() => setRole(it.role)}>
          <span className="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{it.icon}</svg></span>
          <span><b>{it.label}</b><small>{it.sub}</small></span>
        </button>
      ))}
    </div>
  )
}

export default function AppShell({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuthStore(s => s.logout)
  const viewRole = useAuthStore(s => s.viewRole)
  const user = useAuthStore(s => s.user)
  const { openModal, notifications } = useAppStore()
  const { openClars, projects } = useProjectStore()

  const [showNotif, setShowNotif] = useState(false)
  const [showRoleMenu, setShowRoleMenu] = useState(false)
  const [search, setSearch] = useState('')
  const notifRef = useRef()
  const roleRef = useRef()

  const isClient = viewRole === 'client'
  const unread = notifications.filter(n => !n.read).length
  const openClarCount = openClars().length

  const userInitials = getInitials(user?.name)
  const userColor = ROLE_COLORS[viewRole] || 'c-teal'
  const userRoleLabel = ROLE_LABELS[viewRole] || 'BA / PM · Internal'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  useEffect(() => {
    const handler = e => {
      if (!notifRef.current?.contains(e.target)) setShowNotif(false)
      if (!roleRef.current?.contains(e.target)) setShowRoleMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSearch(e) {
    if (e.key === 'Enter' && search.trim()) {
      navigate('/projects')
    }
  }

  async function doLogout() {
    await authApi.logout()   // clears httpOnly cookie on backend + local state
    navigate('/login')
  }

  const navItems = isClient ? buildClientNav(projects) : NAV_BAPM
  const currentPath = location.pathname

  function isActive(path) {
    if (path === '/') return currentPath === '/' || currentPath === '/dashboard'
    return currentPath.startsWith(path)
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="wordmark">Xccelera <span>/ RI</span></div>
        <nav>
          {navItems.map((item, i) => {
            if (item.grp) return <div key={i} className="nav-label">{item.grp}</div>
            if (item.adminOnly && user?.role !== 'admin') return null
            const count = item.countKey === 'clars' ? openClarCount : 0
            return (
              <button key={item.path} className={`nav-item ${isActive(item.path) ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                <NavIcon name={item.icon} />
                {item.label}
                {count > 0 && <span className="count">{count}</span>}
              </button>
            )
          })}
        </nav>
        <div className="side-user">
          <span className={`avatar ${userColor}`}>{userInitials}</span>
          <div>
            <div className="who">{user?.name || 'Unknown'}</div>
            <div className="role-txt">{userRoleLabel}</div>
          </div>
          <button className="so" title="Sign out" onClick={doLogout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <path d="M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ minWidth: 0 }}>
        <div className="main">
          {/* Topbar */}
          <div className="topbar">
            <div>
              <h2 id="viewTitle">Dashboard</h2>
              <div className="date">{today} · Internal workspace</div>
            </div>

            {!isClient && (
              <div className="search">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="search" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleSearch} placeholder="Search projects, clients…" />
              </div>
            )}

            {/* Notifications */}
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button className="icon-btn" onClick={() => setShowNotif(v => !v)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
                </svg>
                {unread > 0 && <span className="ndot">{unread}</span>}
              </button>
              {showNotif && <NotifPanel onClose={() => setShowNotif(false)} />}
            </div>

            {/* Role indicator — only admins can switch perspective */}
            <div className="roleswitch" ref={roleRef}>
              {user?.role === 'admin' ? (
                <>
                  <button onClick={() => setShowRoleMenu(v => !v)}>
                    <span className="vlabel">Viewing as</span>
                    <span>{viewRole === 'admin' ? 'Admin' : viewRole === 'client' ? 'Client Reviewer' : 'BA / PM'}</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                  {showRoleMenu && <RoleMenu onClose={() => setShowRoleMenu(false)} />}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', color: 'var(--ink-soft)', userSelect: 'none' }}>
                  <span style={{ fontSize: '11px', opacity: 0.7 }}>Signed in as</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {viewRole === 'client' ? 'Client Reviewer' : 'BA / PM'}
                  </span>
                </div>
              )}
            </div>

            {!isClient && (
              <button className="btn btn-primary" onClick={() => openModal('newproj')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14"/></svg>
                New project
              </button>
            )}
          </div>

          {/* Page content */}
          {children}
        </div>
      </div>
    </div>
  )
}
