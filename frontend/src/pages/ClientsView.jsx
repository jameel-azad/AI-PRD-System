import { useQuery } from '@tanstack/react-query'
import useAppStore from '../store/appStore'
import { projects as projectsApi } from '../services/api'

const STAGE_ORDER = ['intake','processing','drafted','gap_review','feasibility','client_review','approved']

function portalAccess(stages) {
  const highest = stages.reduce((best, s) => {
    return STAGE_ORDER.indexOf(s) > STAGE_ORDER.indexOf(best) ? s : best
  }, 'intake')
  if (highest === 'client_review' || highest === 'approved') {
    return { label: 'Client Reviewer', cls: 'teal' }
  }
  if (highest === 'feasibility' || highest === 'gap_review') {
    return { label: 'Internal', cls: 'violet' }
  }
  return { label: 'BA/PM', cls: 'gray' }
}

export default function ClientsView() {
  const { openModal } = useAppStore()

  const { data: projects = [], isLoading: projLoading } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => projectsApi.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.items ?? [])),
  })

  // Group projects by client_org
  const orgMap = new Map()
  projects.forEach(p => {
    const org = p.client_org || '—'
    if (!orgMap.has(org)) {
      orgMap.set(org, { name: org, projectCount: 0, stages: [], country: null, industry: null, deployment: null, approverEmail: null })
    }
    const entry = orgMap.get(org)
    entry.projectCount++
    entry.stages.push(p.stage)
    // Take first non-null value seen across all projects for this org
    if (!entry.country && p.country) entry.country = p.country
    if (!entry.industry && p.industry) entry.industry = p.industry
    if (!entry.deployment && p.deployment_type) entry.deployment = p.deployment_type
    if (!entry.approverEmail && p.approver_email) entry.approverEmail = p.approver_email
  })

  const clients = [...orgMap.values()]

  if (projLoading) return <div style={{ padding: '40px', color: 'var(--ink-soft)' }}>Loading clients…</div>

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
      <div className="section-head">
        <h3>Client Organisations ({clients.length})</h3>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Country / Industry</th>
              <th>Deployment</th>
              <th>Primary Contact (Approver)</th>
              <th>Projects</th>
              <th>Portal Access</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => {
              const access = portalAccess(c.stages)
              return (
                <tr key={c.name}>
                  <td><strong>{c.name}</strong></td>
                  <td>
                    <span>{c.country || <span style={{ color: 'var(--ink-soft)' }}>—</span>}</span>
                    <br />
                    <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{c.industry || '—'}</span>
                  </td>
                  <td style={{ color: c.deployment ? 'var(--ink)' : 'var(--ink-soft)' }}>{c.deployment || '—'}</td>
                  <td style={{ fontSize: '13px' }}>
                    {c.approverEmail
                      ? <span style={{ fontFamily: 'var(--mono)', fontSize: '11.5px', color: 'var(--ink-soft)' }}>{c.approverEmail}</span>
                      : <span style={{ color: 'var(--ink-soft)' }}>—</span>
                    }
                  </td>
                  <td style={{ textAlign: 'center' }}>{c.projectCount}</td>
                  <td>
                    <span className={`badge ${access.cls}`}>
                      <span className="dot" />{access.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: '14px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
        Clients are derived from your projects. Country, industry, and deployment details can be added when creating a project.
      </p>
    </>
  )
}
