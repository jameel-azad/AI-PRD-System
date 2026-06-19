import axios from 'axios'
import useAuthStore from '../store/authStore'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) useAuthStore.getState().logout()
    return Promise.reject(err)
  }
)

export const auth = {
  register: data => api.post('/auth/register', data),
  login:    data => api.post('/auth/login', data),
  me:       ()   => api.get('/auth/me'),
  auditLog: ()   => api.get('/auth/audit-log'),
}

export const projects = {
  list:        ()           => api.get('/projects/'),
  get:         id           => api.get(`/projects/${id}`),
  create:      data         => api.post('/projects/', data),
  updateStage: (id, stage)  => api.patch(`/projects/${id}/stage`, { stage }),
  comments:    id           => api.get(`/projects/${id}/comments`),
  addComment:  (id, data)   => api.post(`/projects/${id}/comments`, data),
}

export const files = {
  upload: (projectId, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/files/${projectId}/upload`, form)
  },
}

export const prd = {
  get:       projectId => api.get(`/prd/${projectId}`),
  approve:   (projectId, data) => api.post(`/prd/${projectId}/approve`, data),
  approvals: projectId => api.get(`/prd/${projectId}/approvals`),
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
  stats:      ()         => api.get('/queue/stats'),
  taskStatus: taskId     => api.get(`/queue/tasks/${taskId}`),
  cancelTask: taskId     => api.delete(`/queue/tasks/${taskId}`),
}

export default api
