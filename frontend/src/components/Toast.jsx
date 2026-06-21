import useAppStore from '../store/appStore'

export default function Toast() {
  const toast = useAppStore(s => s.toast)
  return (
    <div aria-live="polite" aria-atomic="true">
      {toast && (
        <div className={`toast show${toast.type === 'error' ? ' toast-error' : ''}`}>
          {toast.busy && <span className="spinner" />}
          {toast.msg}
          {toast.cite && <span className="cite">{toast.cite}</span>}
        </div>
      )}
    </div>
  )
}
