import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user:  null,
      viewRole: 'bapm',  // bapm | admin | client
      login:  ({ access_token, user }) => set({ token: access_token, user, viewRole: user?.role || 'bapm' }),
      logout: () => set({ token: null, user: null, viewRole: 'bapm' }),
      setViewRole: (role) => set({ viewRole: role }),
    }),
    { name: 'prd-auth' }
  )
)

export default useAuthStore
