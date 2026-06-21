import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import useAuthStore from './store/authStore'
import useProjectStore from './store/projectStore'
import { auth as authApi } from './services/api'
import LoginPage from './pages/LoginPage'
import AppShell from './components/AppShell'
import Dashboard from './pages/Dashboard'
import ProjectsView from './pages/ProjectsView'
import ClarificationsView from './pages/ClarificationsView'
import ApprovalsView from './pages/ApprovalsView'
import ClientsView from './pages/ClientsView'
import TeamView from './pages/TeamView'
import SettingsView from './pages/SettingsView'
import ProjectWorkspace from './pages/ProjectWorkspace'
import Toast from './components/Toast'
import ModalHost from './components/ModalHost'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function NotFound() {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center', gap: '16px' }}>
      <div style={{ fontSize: '48px' }}>404</div>
      <h3 style={{ margin: 0, fontSize: '20px' }}>Page not found</h3>
      <p style={{ margin: 0, color: 'var(--ink-soft)', maxWidth: '380px', lineHeight: 1.6 }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: '8px' }}>
        Back to Dashboard
      </button>
    </div>
  )
}

function PrivateRoute({ children }) {
  const user = useAuthStore(s => s.user)
  return user ? children : <Navigate to="/login" replace />
}

function RoleRoute({ roles, children }) {
  const viewRole = useAuthStore(s => s.viewRole)
  return roles.includes(viewRole) ? children : <Navigate to="/" replace />
}

function AuthedApp() {
  const initFromApi = useProjectStore(s => s.initFromApi)
  useEffect(() => { initFromApi() }, [initFromApi])

  useEffect(() => {
    // Silently refresh the auth cookie on mount and every 20 minutes to prevent silent expiry.
    authApi.refresh().catch(() => {})
    const id = setInterval(() => { authApi.refresh().catch(() => {}) }, 20 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<ProjectsView />} />
        <Route path="/projects/:id" element={<ProjectWorkspace />} />
        <Route path="/projects/:id/:tab" element={<ProjectWorkspace />} />
        <Route path="/clarifications" element={<ClarificationsView />} />
        <Route path="/approvals" element={<RoleRoute roles={['admin','bapm']}><ApprovalsView /></RoleRoute>} />
        <Route path="/clients" element={<RoleRoute roles={['admin','bapm']}><ClientsView /></RoleRoute>} />
        <Route path="/team" element={<RoleRoute roles={['admin']}><TeamView /></RoleRoute>} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<PrivateRoute><AuthedApp /></PrivateRoute>} />
        </Routes>
        <Toast />
        <ModalHost />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
