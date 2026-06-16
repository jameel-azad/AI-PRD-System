export function FeasBadge({ score }) {
  if (score === 'green') return <span className="badge green"><span className="dot" />High</span>
  if (score === 'amber') return <span className="badge amber"><span className="dot" />Med</span>
  if (score === 'red')   return <span className="badge red"><span className="dot" />Low</span>
  return <span className="badge gray"><span className="dot" />Pending</span>
}

export function FeasLabel({ score }) {
  if (score === 'green') return 'HIGH'
  if (score === 'amber') return 'MED'
  if (score === 'red')   return 'LOW'
  return 'PENDING'
}

export function MeterColor(p) {
  return p >= 90 ? 'var(--green)' : p >= 60 ? 'var(--accent)' : p >= 40 ? 'var(--amber)' : 'var(--red)'
}

export function Avatar({ user, size = '' }) {
  const initials = user.name.split(' ').map(x => x[0]).join('').slice(0, 2)
  return <span className={`avatar ${size} ${user.color}`}>{initials}</span>
}

export function AvatarStack({ users }) {
  return (
    <div className="stack">
      {users.map(u => <Avatar key={u.id} user={u} size="xs" />)}
    </div>
  )
}
