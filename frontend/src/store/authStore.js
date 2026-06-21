import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set) => ({
      user:     null,
      viewRole: 'bapm',  // bapm | admin | client
      login: ({ user }) => {
        // Backend enum uses "ba_pm"; the frontend ROLE_MAP and comparisons use "bapm".
        const viewRole = user?.role === 'ba_pm' ? 'bapm' : (user?.role || 'bapm')
        set({ user, viewRole })
      },
      logout: () => set({ user: null, viewRole: 'bapm' }),
      setViewRole: (role) => set({ viewRole: role }),
    }),
    {
      name: 'prd-auth',
      // Only persist the user object — token lives in an httpOnly cookie, not localStorage
      partialize: (state) => ({ user: state.user, viewRole: state.viewRole }),
    }
  )
)

export default useAuthStore
