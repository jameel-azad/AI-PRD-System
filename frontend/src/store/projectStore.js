import { create } from 'zustand'
import { INITIAL_PROJECTS, USERS, BUILTIN_ROLES } from '../data/mockData'

const useProjectStore = create((set, get) => ({
  projects: JSON.parse(JSON.stringify(INITIAL_PROJECTS)),
  users: JSON.parse(JSON.stringify(USERS)),
  roles: JSON.parse(JSON.stringify(BUILTIN_ROLES)),

  projById: (id) => get().projects.find(p => p.id === id),
  userById: (id) => get().users.find(u => u.id === id),
  roleById: (id) => get().roles.find(r => r.id === id) || { id, label: id, desc: 'Custom role', badge: 'gray', external: false },
  teamMembers: () => get().users.filter(u => u.role !== 'client'),
  openClars: () => get().projects.flatMap(p => p.clars.filter(c => c.state === 'open').map(c => ({ p, c }))),

  updateProject: (id, updater) => {
    set(s => ({
      projects: s.projects.map(p => p.id === id ? updater({ ...p }) : p)
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
