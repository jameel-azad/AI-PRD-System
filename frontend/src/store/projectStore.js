import { create } from 'zustand'
import { INITIAL_PROJECTS, USERS, BUILTIN_ROLES } from '../data/mockData'
import { projects as projectsApi } from '../services/api'
import useAuthStore from './authStore'
import useAppStore from './appStore'

const STAGE_TO_INDEX = {
  intake: 0, processing: 1, drafted: 2,
  gap_review: 3, feasibility: 4, client_review: 5, approved: 6,
}

function apiProjectToStore(p) {
  const stageLabel = (p.stage || 'intake').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return {
    id: p.id,
    name: p.name,
    client: p.client_org,
    client_org: p.client_org,
    country: '',
    industry: '',
    feas: 'green',
    completeness: 0,
    status: p.stage === 'approved' ? 'approved' : p.stage === 'processing' ? 'draft' : 'intake',
    statusLabel: stageLabel,
    langs: 'EN',
    deadline: '—',
    updated: p.created_at ? new Date(p.created_at).toLocaleDateString() : '—',
    deploy: 'SaaS',
    approver: '—',
    stage: STAGE_TO_INDEX[p.stage] ?? 0,
    team: [],
    sources: [],
    tag: `${p.requirement_count ?? 0} requirements`,
    sections: new Array(14).fill(0),
    inputs: (p.files || []).map(f => ({
      fileId: f.id,
      name: f.filename,
      kind: f.file_type,
      size: '—',
      stat: f.status === 'complete' ? 'done' : f.status === 'processing' ? 'proc' : 'queue',
      prog: f.status === 'complete' ? 100 : 0,
      meta: f.status,
    })),
    flowState: [0, 0, 0, 0, 0, 0, 0, 0],
    clars: [],
    comments: [],
    feasReport: null,
    reqs: [],
    injected: [],
    feasResolved: {},
    activity: [],
  }
}

const useProjectStore = create((set, get) => ({
  projects: [],
  users: [],
  roles: JSON.parse(JSON.stringify(BUILTIN_ROLES)),

  projById: (id) => get().projects.find(p => String(p.id) === String(id)),
  userById: (id) => get().users.find(u => u.id === id),
  roleById: (id) => get().roles.find(r => r.id === id) || { id, label: id, desc: 'Custom role', badge: 'gray', external: false },
  teamMembers: () => get().users.filter(u => u.role !== 'client'),
  openClars: () => get().projects.flatMap(p => (p.clars || []).filter(c => c.state === 'open').map(c => ({ p, c }))),

  initFromApi: async () => {
    // Build a real user entry for the logged-in user from the auth token.
    const currentUser = useAuthStore.getState().user
    const ROLE_COLORS = { admin: 'c-violet', bapm: 'c-teal', ba_pm: 'c-teal', client: 'c-green' }
    const ROLE_LABELS = { admin: 'Admin', bapm: 'BA / PM', ba_pm: 'BA / PM', client: 'Client Reviewer' }
    const toStoreRole = r => (r === 'ba_pm' ? 'bapm' : r || 'bapm')

    function currentUserEntry(u) {
      const role = toStoreRole(u.role)
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role,
        roleLabel: ROLE_LABELS[role] || role,
        color: ROLE_COLORS[role] || 'c-teal',
        status: 'Active',
        last: 'now',
      }
    }

    try {
      const { data } = await projectsApi.list()
      const users = currentUser ? [currentUserEntry(currentUser)] : []
      set({ projects: data.map(apiProjectToStore), users })
      // Real API succeeded — notifications start empty (real events will push in over time)
      useAppStore.getState().clearNotifications()
    } catch {
      // API unreachable — fall back to demo data so the UI still renders.
      set({
        projects: JSON.parse(JSON.stringify(INITIAL_PROJECTS)),
        users: JSON.parse(JSON.stringify(USERS)),
      })
      useAppStore.getState().loadDemoNotifications()
      useAppStore.getState().showToast(
        'Backend unreachable — showing demo data. Real data will appear when the API is available.',
        'offline mode'
      )
    }
  },

  updateProject: (id, updater) => {
    set(s => ({
      projects: s.projects.map(p => String(p.id) === String(id) ? updater({ ...p }) : p)
    }))
  },

  addProject: (proj) => {
    set(s => ({ projects: [proj, ...s.projects] }))
  },

  addProjectActivity: (pid, entry) => {
    get().updateProject(pid, p => {
      p.activity = [entry, ...p.activity]
      return p
    })
  },

  updateClar: (pid, idx, updater) => {
    get().updateProject(pid, p => {
      p.clars = p.clars.map((c, i) => i === idx ? updater({ ...c }) : c)
      return p
    })
  },

  updateInjected: (pid, idx, state) => {
    get().updateProject(pid, p => {
      p.injected = p.injected.map((r, i) => i === idx ? { ...r, state } : r)
      return p
    })
  },

  addComment: (pid, comment) => {
    get().updateProject(pid, p => {
      p.comments = [comment, ...p.comments]
      return p
    })
  },

  addReply: (pid, ci, msg) => {
    get().updateProject(pid, p => {
      p.comments = p.comments.map((c, i) => i === ci
        ? { ...c, thread: [...c.thread, msg] }
        : c
      )
      return p
    })
  },

  resolveThread: (pid, ci) => {
    get().updateProject(pid, p => {
      p.comments = p.comments.map((c, i) => i === ci ? { ...c, resolved: !c.resolved } : c)
      return p
    })
  },

  toggleFeasAction: (pid, aid, val) => {
    get().updateProject(pid, p => {
      p.feasResolved = { ...(p.feasResolved || {}), [aid]: val }
      return p
    })
  },

  changeUserRole: (uid, role, roleLabel) => {
    set(s => ({
      users: s.users.map(u => u.id === uid ? { ...u, role, roleLabel } : u)
    }))
  },

  addUser: (user) => {
    set(s => ({ users: [...s.users, user] }))
  },

  addRole: (role) => {
    set(s => ({ roles: [...s.roles, role] }))
  },
}))

export default useProjectStore
