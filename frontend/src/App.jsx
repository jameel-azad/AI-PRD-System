import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import useAuthStore from './store/authStore'
import useProjectStore from './store/projectStore'
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

function tokenIsValid(token) {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return tokenIsValid(token) ? children : <Navigate to="/login" replace />
}

function AuthedApp() {
  const initFromApi = useProjectStore(s => s.initFromApi)
  useEffect(() => { initFromApi() }, [initFromApi])

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<ProjectsView />} />
        <Route path="/projects/:id" element={<ProjectWorkspace />} />
        <Route path="/projects/:id/:tab" element={<ProjectWorkspace />} />
        <Route path="/clarifications" element={<ClarificationsView />} />
        <Route path="/approvals" element={<ApprovalsView />} />
        <Route path="/clients" element={<ClientsView />} />
        <Route path="/team" element={<TeamView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
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
