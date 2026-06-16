import { useNavigate } from 'react-router-dom'
import useProjectStore from '../store/projectStore'
import { FeasBadge, MeterColor, AvatarStack } from '../components/Badge'
import { STAGES } from '../data/mockData'

export default function ProjectsView() {
  const navigate = useNavigate()
  const { projects, userById } = useProjectStore()

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Project</th><th>Client</th><th>Stage</th><th>Feasibility</th><th>Completeness</th><th>Team</th><th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => {
              const teamUsers = p.team.map(id => userById(id)).filter(Boolean)
              const color = MeterColor(p.completeness)
              return (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong><br />
                    <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{p.industry} · {p.deploy} · upd {p.updated}</span>
                  </td>
                  <td>{p.client}<br /><span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{p.country}</span></td>
                  <td>
                    <span className={`badge ${p.stage >= 6 ? 'green' : p.status === 'blocked' ? 'red' : 'gray'}`}>
                      <span className="dot" />{STAGES[p.stage]}
                    </span>
                  </td>
                  <td><FeasBadge score={p.feas} /></td>
                  <td style={{ minWidth: '150px' }}>
                    <div className="meterline">
                      <div className="meter"><i style={{ width: `${p.completeness}%`, background: color }} /></div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{p.completeness}%</span>
                    </div>
                  </td>
                  <td><AvatarStack users={teamUsers} /></td>
                  <td>
                    {p.status === 'blocked'
                      ? <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/projects/${p.id}/feasibility`)}>Report</button>
                      : <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/projects/${p.id}`)}>Open</button>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '14px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
        Tip: the stage column tracks the lifecycle — Intake → Processing → Drafted → Gap review → Feasibility → Client review → Approved.
      </p>
    </>
  )
}
