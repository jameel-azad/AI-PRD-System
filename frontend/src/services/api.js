import axios from 'axios'
import useAuthStore from '../store/authStore'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? '') + '/api/v1',
  // Required for the httpOnly auth cookie to be sent on every request.
  // The Vite proxy makes all /api calls same-origin, so Lax cookies are included automatically.
  withCredentials: true,
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

async function logoutAndClear() {
  try { await api.post('/auth/logout') } catch {}
  useAuthStore.getState().logout()
}

export const auth = {
  register:        data          => api.post('/auth/register', data),
  login:           data          => api.post('/auth/login', data),
  logout:          ()            => logoutAndClear(),
  refresh:         ()            => api.post('/auth/refresh'),
  me:              ()            => api.get('/auth/me'),
  forgotPassword:  email         => api.post('/auth/forgot-password', { email }),
  resetPassword:   data          => api.post('/auth/reset-password', data),
  auditLog:        ()            => api.get('/auth/audit-log'),
  users:           ()            => api.get('/auth/users'),
  createUser:      data          => api.post('/auth/users', data),
  updateUserRole:  (id, role)    => api.patch(`/auth/users/${id}/role`, { role }),
  deleteUser:      id            => api.delete(`/auth/users/${id}`),
  generateInvite:  role          => api.post('/auth/invite', { role }),
}

export const projects = {
  list:        (params)     => api.get('/projects/', { params }),
  get:         id           => api.get(`/projects/${id}`),
  create:      data         => api.post('/projects/', data),
  updateStage: (id, stage)  => api.patch(`/projects/${id}/stage`, { stage }),
  comments:       id                    => api.get(`/projects/${id}/comments`),
  addComment:     (id, data)            => api.post(`/projects/${id}/comments`, data),
  resolveComment: (projectId, commentId) => api.patch(`/projects/${projectId}/comments/${commentId}/resolve`),
  answerGap:      (projectId, gapKey, answer) => api.patch(`/projects/${projectId}/gaps/answer`, { gap_key: gapKey, answer }),
  activity:       projectId => api.get(`/projects/${projectId}/activity`),
}

export const files = {
  upload: (projectId, file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/files/${projectId}/upload`, form, {
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round(e.loaded / e.total * 100))
      },
    })
  },
  delete: fileId => api.delete(`/files/${fileId}`),
}

export const prd = {
  get:        projectId              => api.get(`/prd/${projectId}`),
  versions:   projectId              => api.get(`/prd/${projectId}/versions`),
  getVersion: (projectId, versionNum) => api.get(`/prd/${projectId}/version/${versionNum}`),
  approve:    (projectId, data)      => api.post(`/prd/${projectId}/approve`, data),
  approvals:  projectId              => api.get(`/prd/${projectId}/approvals`),
}

export const feasibility = {
  run:      (projectId, data) => api.post(`/feasibility/${projectId}/run`, data),
  get:       projectId        => api.get(`/feasibility/${projectId}`),
  override:  projectId        => api.post(`/feasibility/${projectId}/override`),
}

export const exportPrd = {
  download: (projectId, format = 'pdf') =>
    api.get(`/export/${projectId}?format=${format}`, { responseType: 'blob' }),
}

export const queue = {
  stats:       ()          => api.get('/queue/stats'),
  taskStatus:  taskId      => api.get(`/queue/tasks/${taskId}`),
  cancelTask:  taskId      => api.delete(`/queue/tasks/${taskId}`),
  reprocess:   projectId   => api.post(`/queue/${projectId}/reprocess`),
}

export default api
