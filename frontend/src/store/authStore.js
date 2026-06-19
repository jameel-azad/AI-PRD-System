import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user:  null,
      viewRole: 'bapm',  // bapm | admin | client
      login:  ({ access_token, user }) => {
        // Backend enum uses "ba_pm"; the frontend ROLE_MAP and comparisons use "bapm".
        const viewRole = user?.role === 'ba_pm' ? 'bapm' : (user?.role || 'bapm')
        set({ token: access_token, user, viewRole })
      },
      logout: () => set({ token: null, user: null, viewRole: 'bapm' }),
      setViewRole: (role) => set({ viewRole: role }),
    }),
    { name: 'prd-auth' }
  )
)

export default useAuthStore
