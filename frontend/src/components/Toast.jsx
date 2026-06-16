import useAppStore from '../store/appStore'

export default function Toast() {
  const toast = useAppStore(s => s.toast)
  if (!toast) return null
  return (
    <div className={`toast show`}>
      {toast.busy && <span className="spinner" />}
      {toast.msg}
      {toast.cite && <span className="cite">{toast.cite}</span>}
    </div>
  )
}
