import { create } from 'zustand'

const useAppStore = create((set, get) => ({
  // Toast
  toast: null,
  toastTimer: null,
  showToast(msg, cite, ms = 3200) {
    const prev = get().toastTimer
    if (prev) clearTimeout(prev)
    const timer = setTimeout(() => set({ toast: null, toastTimer: null }), ms)
    // If cite === 'error', treat it as an error type (no subtitle); otherwise it's a subtitle string.
    const type = cite === 'error' ? 'error' : 'info'
    const subtitle = cite === 'error' ? null : cite
    set({ toast: { msg, cite: subtitle, type, busy: false }, toastTimer: timer })
  },
  busyToast(msg) {
    const prev = get().toastTimer
    if (prev) clearTimeout(prev)
    set({ toast: { msg, cite: null, busy: true }, toastTimer: null })
  },
  clearToast() {
    const prev = get().toastTimer
    if (prev) clearTimeout(prev)
    set({ toast: null, toastTimer: null })
  },

  // Modal
  modal: null,
  openModal(type, param) { set({ modal: { type, param } }) },
  closeModal() { set({ modal: null }) },

  // Notifications — start empty for real users; demo data loaded only in offline/fallback mode
  notifications: [],
  _demoNotifications: [
    {id:1, type:'comment',  icon:'💬', text:'<b>Lena Weber</b> commented on <b>§6 Non-Functional</b> in Patient Intake Portal', proj:'medaxis', time:'9 min ago', read:false},
    {id:2, type:'gap',      icon:'🕳', text:'Gap analysis finished for <b>HR Onboarding Suite</b> — 4 follow-up questions generated', proj:'hr', time:'Yesterday 18:20', read:false},
    {id:3, type:'sanction', icon:'⛔', text:'Feasibility agent flagged a <b>hard blocker</b> (OFAC SDN) on Fleet Telemetry Analytics', proj:'volkov', time:'Jun 10 17:31', read:false},
    {id:4, type:'approve',  icon:'✅', text:'<b>Rana Haddad</b> approved Retail Loyalty &amp; Wallet App — PRD v1.0 locked', proj:'nimbus', time:'Jun 9 14:05', read:true},
    {id:5, type:'deadline', icon:'⏰', text:'Approval deadline for <b>Patient Intake Portal</b> is in 4 days (Jun 16)', proj:'medaxis', time:'Jun 9 09:00', read:true},
    {id:6, type:'assign',   icon:'📌', text:'<b>Arjun M.</b> assigned you a clarification on insurance-registry integrations', proj:'medaxis', time:'Jun 8 16:42', read:true},
  ],
  loadDemoNotifications() { set(s => ({ notifications: s._demoNotifications })) },
  clearNotifications() { set({ notifications: [] }) },
  pushNotif(type, icon, text, proj) {
    const n = { id: Date.now(), type, icon, text, proj, time: 'Just now', read: false }
    set(s => ({ notifications: [n, ...s.notifications] }))
  },
  markRead(id) {
    set(s => ({ notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n) }))
  },
  markAllRead() {
    set(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })) }))
  },
}))

export default useAppStore
