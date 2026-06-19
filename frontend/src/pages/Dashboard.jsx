import { useNavigate } from 'react-router-dom'
import useProjectStore from '../store/projectStore'
import useAppStore from '../store/appStore'
import useAuthStore from '../store/authStore'
import { FeasBadge, MeterColor, AvatarStack } from '../components/Badge'
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

export default function Dashboard() {
  const navigate = useNavigate()
  const { projects, openClars } = useProjectStore()
  const { openModal } = useAppStore()
  const user = useAuthStore(s => s.user)

  const allOpen = openClars()
  // Match clarification assignee against the logged-in user's first name (case-insensitive)
  const myFirstName = user?.name?.split(' ')[0]?.toLowerCase() || ''
  const mine = myFirstName
    ? allOpen.filter(({ c }) => c.assignee?.toLowerCase() === myFirstName)
    : []
  const avgComp = projects.length
    ? Math.round(projects.reduce((a, p) => a + (p.completeness || 0), 0) / projects.length)
    : 0
  const awaitingApproval = projects.filter(p => p.status === 'review').length

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
          <div className="k">Open clarifications</div>
          <div className="v">{allOpen.length}</div>
          <div className="d">{mine.length > 0 ? `${mine.length} assigned to you → answer now` : 'none assigned to you'}</div>
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
              <h3>My tasks</h3>
              <span className="count">{mine.length} assigned</span>
            </div>
            {mine.length === 0
              ? <div className="empty">No tasks assigned to you</div>
              : mine.slice(0, 4).map(({ p, c }, i) => (
                <div key={i} className="q">
                  <span className="proj">{p.client}</span>
                  <p>{c.q}</p>
                  <div className="qrow">
                    <span className={`prio ${c.prio}`}>{c.prio}</span>
                    <span className="src-tag" style={{ margin: 0 }}>{c.gap}</span>
                  </div>
                </div>
              ))
            }
            <button className="btn btn-ghost send" onClick={() => navigate('/clarifications')}>Open clarifications →</button>
          </div>

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
