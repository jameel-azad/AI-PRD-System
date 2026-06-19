import useProjectStore from '../store/projectStore'
import useAppStore from '../store/appStore'

export default function ClientsView() {
  const { projects } = useProjectStore()
  const { openModal } = useAppStore()

  // Derive unique clients from real projects
  const clientMap = new Map()
  projects.forEach(p => {
    const key = p.client_org || p.client || '—'
    if (!clientMap.has(key)) {
      clientMap.set(key, {
        name: key,
        country: p.country || '—',
        industry: p.industry || '—',
        deploy: p.deploy || 'SaaS',
        projectCount: 1,
        feas: p.feas || 'green',
      })
    } else {
      clientMap.get(key).projectCount++
    }
  })
  const clients = [...clientMap.values()]

  if (clients.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>🏢</div>
        <h3 style={{ margin: 0, fontSize: '20px' }}>No clients yet</h3>
        <p style={{ margin: 0, color: 'var(--ink-soft)', maxWidth: '380px', lineHeight: 1.6 }}>
          Clients appear here automatically when you create a project and assign a client organisation to it.
        </p>
        <button className="btn btn-primary" onClick={() => openModal('newproj')} style={{ marginTop: '8px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14"/></svg>
          New project
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Country / Industry</th>
              <th>Deployment</th>
              <th>Projects</th>
              <th>Feasibility</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c, i) => (
              <tr key={i}>
                <td><strong>{c.name}</strong></td>
                <td>
                  {c.country}
                  <br />
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{c.industry}</span>
                </td>
                <td>{c.deploy}</td>
                <td>{c.projectCount}</td>
                <td>
                  <span className={`badge ${c.feas === 'red' ? 'red' : c.feas === 'amber' ? 'amber' : 'green'}`}>
                    <span className="dot" />
                    {c.feas === 'red' ? 'Blocked' : c.feas === 'amber' ? 'Amber' : 'Clear'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '14px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
        Clients are derived from your projects. Add country, industry, and deployment details when creating a project.
      </p>
    </>
  )
}
