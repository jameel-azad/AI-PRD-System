import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import useProjectStore from '../store/projectStore'
import useAppStore from '../store/appStore'
import { FeasBadge, MeterColor, AvatarStack } from '../components/Badge'
import { auth as authApi } from '../services/api'
import { STAGES } from '../data/mockData'

function StageMini({ stage }) {
  return (
    <span className="stage-mini" title={STAGES[stage]}>
      {STAGES.map((_, i) => <i key={i} className={i < stage ? 'done' : i === stage ? 'cur' : ''} />)}
    </span>
  )
}

function ProjectCard({ p, onOpen }) {
  const { userById } = useProjectStore()
  const teamUsers = p.team.map(id => userById(id)).filter(Boolean)
  const color = MeterColor(p.completeness)

  return (
    <article className="pcard">
      <div className="row1">
        <div>
          <h4>{p.name}</h4>
          <div className="client">{p.client} · {p.country} · {p.industry}</div>
        </div>
        <FeasBadge score={p.feas} />
      </div>
      <div className="meterline">
        <div className="meter"><i style={{ width: `${p.completeness}%`, background: color }} /></div>
        <span className="meter-val">{p.completeness}% complete</span>
      </div>
      <div className="srcs">
        {p.sources.map((s, i) => <span key={i} className="src">{s}</span>)}
        <span className="cite">{p.tag}</span>
      </div>
      <div className="foot">
        <StageMini stage={p.stage} />
        <span className={`status ${p.status}`}>{p.statusLabel}</span>
        <AvatarStack users={teamUsers} />
        <button className="linkbtn" onClick={() => onOpen(p)}>
          {p.status === 'blocked' ? 'Open report' : 'Open project'}
        </button>
      </div>
    </article>
  )
}

const ACTION_LABELS = {
  CREATE_PROJECT: { ico: '🗂', label: 'Project created' },
  COMMENT: { ico: '💬', label: 'Comment added' },
  APPROVAL_APPROVED: { ico: '✅', label: 'PRD approved' },
  APPROVAL_REJECTED: { ico: '↩', label: 'Approval rejected' },
}

function RecentActivity() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['audit-log-dash'],
    queryFn: () => authApi.auditLog().then(r => r.data),
    staleTime: 60_000,
  })

  return (
    <div className="panel" style={{ marginTop: '20px' }}>
      <div className="panel-h"><h3>Recent activity</h3></div>
      {isLoading && <div style={{ padding: '12px 18px', color: 'var(--ink-soft)', fontSize: '13px' }}>Loading…</div>}
      {!isLoading && events.length === 0 && (
        <div className="empty">No activity recorded yet.</div>
      )}
      {events.slice(0, 8).map((e, i) => {
        const def = ACTION_LABELS[e.action] || { ico: '⚡', label: e.action.replace(/_/g, ' ').toLowerCase() }
        const ts = new Date(e.ts)
        const timeStr = isNaN(ts) ? '' : ts.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
        return (
          <div key={i} className="q" style={{ cursor: 'default' }}>
            <span className="proj" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{def.ico}</span>
              <b>{e.actor}</b>
            </span>
            <p style={{ margin: '2px 0', fontSize: '12.5px' }}>{def.label}{e.detail ? ` — ${e.detail}` : ''}</p>
            <div className="qrow"><span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{timeStr}</span></div>
          </div>
        )
      })}
    </div>
  )
}

function stageIs(p, ...vals) {
  return vals.some(v => p.stage === v || String(p.stage) === String(v))
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { projects } = useProjectStore()
  const { openModal } = useAppStore()

  const awaitingApproval = projects.filter(p => stageIs(p, 'client_review', 5)).length
  const gapReview        = projects.filter(p => stageIs(p, 'gap_review', 3))
  const inProgress       = projects.filter(p => stageIs(p, 'processing', 1))
  const avgComp          = projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.completeness || 0), 0) / projects.length)
    : 0

  function openProject(p) {
    if (p.status === 'blocked') navigate(`/projects/${p.id}/feasibility`)
    else navigate(`/projects/${p.id}`)
  }

  if (projects.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>📋</div>
        <h3 style={{ margin: 0, fontSize: '20px' }}>No projects yet</h3>
        <p style={{ margin: 0, color: 'var(--ink-soft)', maxWidth: '380px', lineHeight: 1.6 }}>
          Create your first project to start extracting requirements from client calls, documents, and chats.
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
      <div className="stats">
        <button className="stat" onClick={() => navigate('/projects')}>
          <div className="k">Active projects</div>
          <div className="v">{projects.length}</div>
          <div className="d">view all →</div>
        </button>
        <button className="stat" onClick={() => navigate('/projects')}>
          <div className="k">Avg PRD completeness</div>
          <div className="v">{avgComp}%</div>
          <div className="d">Target ≥ 95% before approval</div>
        </button>
        <button className="stat" onClick={() => navigate('/clarifications')}>
          <div className="k">Needs clarification</div>
          <div className="v">{gapReview.length}</div>
          <div className="d">{gapReview.length > 0 ? `${gapReview.length} project${gapReview.length > 1 ? 's' : ''} in gap review` : 'no open gaps'}</div>
        </button>
        <button className="stat" onClick={() => navigate('/approvals')}>
          <div className="k">Awaiting client approval</div>
          <div className="v">{awaitingApproval}</div>
          <div className="d">{awaitingApproval === 0 ? 'nothing pending' : `${awaitingApproval} project${awaitingApproval > 1 ? 's' : ''} awaiting review`}</div>
        </button>
      </div>

      <div className="layout">
        <section>
          <div className="section-head">
            <h3>Recent projects</h3>
            <button className="all" onClick={() => navigate('/projects')}>View all projects →</button>
          </div>
          <div className="grid">
            {projects.map(p => <ProjectCard key={p.id} p={p} onOpen={openProject} />)}
          </div>
        </section>

        <aside>
          <div className="panel">
            <div className="panel-h">
              <h3>Needs attention</h3>
              <span className="count">{gapReview.length + inProgress.length} items</span>
            </div>
            {gapReview.length === 0 && inProgress.length === 0
              ? <div className="empty">All projects are on track</div>
              : [...gapReview, ...inProgress].slice(0, 5).map(p => (
                <div key={p.id} className="q" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                  <span className="proj">{p.client_org || p.client || p.name}</span>
                  <p style={{ margin: '2px 0', fontSize: '12.5px' }}>{stageIs(p, 'gap_review', 3) ? 'Gap analysis complete — clarifications needed' : 'Processing pipeline running'}</p>
                  <div className="qrow">
                    <span className={`prio ${stageIs(p, 'gap_review', 3) ? 'high' : 'med'}`}>{stageIs(p, 'gap_review', 3) ? 'gap review' : 'processing'}</span>
                  </div>
                </div>
              ))
            }
            <button className="btn btn-ghost send" onClick={() => navigate('/clarifications')}>Open clarifications →</button>
          </div>

          <RecentActivity />

          <div className="panel ingest" style={{ marginTop: '20px' }}>
            <div className="panel-h"><h3>Add inputs to a project</h3></div>
            <div className="types">
              {[
                ['🎥','Video','MP4 · MOV · ≤ 1 GB'],
                ['🎙','Audio','MP3 · WAV · ≤ 500 MB'],
                ['📄','Documents','PDF · Word · ≤ 50 MB'],
                ['💬','Chat export','Slack · WhatsApp · ≤ 10 MB'],
                ['✉️','Email','Forward-to-ingest'],
                ['⏺','Live record','In-app · ≤ 1 GB'],
              ].map(([ico, label, sub]) => (
                <button key={label} className="itype" onClick={() => openModal('upload')}>
                  {ico} <span><b>{label}</b><small>{sub}</small></span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
