import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useProjectStore from '../store/projectStore'
import useAppStore from '../store/appStore'

export default function ClarificationsView() {
  const navigate = useNavigate()
  const { projects, teamMembers, updateClar, addProjectActivity } = useProjectStore()
  const { showToast } = useAppStore()
  const [answering, setAnswering] = useState({})
  const [answers, setAnswers] = useState({})

  const groups = projects.filter(p => p.clars.length > 0)

  function toggleAnswer(pid, i) {
    const key = `${pid}-${i}`
    setAnswering(a => ({ ...a, [key]: !a[key] }))
  }

  function saveAnswer(pid, i) {
    const key = `${pid}-${i}`
    const val = (answers[key] || '').trim()
    if (!val) { showToast('Type an answer first'); return }
    updateClar(pid, i, c => ({ ...c, state: 'answered', answer: val.length > 60 ? val.slice(0, 57) + '…' : val }))
    addProjectActivity(pid, { ico: '✅', c: 'green-soft', cl: 'var(--green)', txt: 'Clarification answered & merged into PRD', time: 'Just now' })
    showToast('Answer merged into PRD · completeness recalculated')
    setAnswering(a => ({ ...a, [key]: false }))
  }

  function sendQuestion(pid, i, approver) {
    showToast(`Question emailed to ${approver}`)
    addProjectActivity(pid, { ico: '📧', c: 'accent-soft', cl: 'var(--accent)', txt: `Follow-up question emailed to ${approver}`, time: 'Just now' })
  }

  function sendAll(pid, approver, openCount) {
    if (!openCount) { showToast('No open questions to send'); return }
    showToast(`${openCount} question(s) emailed to ${approver}`)
    addProjectActivity(pid, { ico: '📧', c: 'accent-soft', cl: 'var(--accent)', txt: `${openCount} follow-up questions emailed to client`, time: 'Just now' })
  }

  function assignClar(pid, i, uid) {
    updateClar(pid, i, c => ({ ...c, assignee: uid }))
    const u = useProjectStore.getState().userById(uid)
    showToast(uid ? `Question assigned to ${u?.name}` : 'Question unassigned')
  }

  if (!groups.length) {
    return <div className="panel"><div className="empty">No clarifications. Run gap analysis on a project to generate follow-up questions.</div></div>
  }

  return (
    <>
      {groups.map(p => {
        const team = teamMembers()
        const openCount = p.clars.filter(c => c.state === 'open').length
        return (
          <div key={p.id}>
            <div className="section-head" style={{ marginTop: '6px' }}>
              <h3>{p.name} <span style={{ fontWeight: 500, color: 'var(--ink-soft)', fontSize: '13px' }}>· {p.client}</span></h3>
              <button className="all" onClick={() => navigate(`/projects/${p.id}/prd`)}>Open PRD →</button>
            </div>
            <div className="panel" style={{ marginBottom: '24px' }}>
              {p.clars.map((c, i) => {
                const key = `${p.id}-${i}`
                const isAnswering = answering[key]
                return (
                  <div key={i} className={`q ${c.state === 'answered' ? 'answered' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
                      <span className="proj">{c.state === 'answered' ? 'Answered' : c.state === 'sent' ? 'Sent to client' : 'Open'}</span>
                      <span className={`prio ${c.prio}`}>{c.prio} priority</span>
                    </div>
                    <p style={{ marginTop: '8px' }}>{c.q}</p>
                    <span className="src-tag">{c.gap}</span>
                    {c.state === 'answered' ? (
                      <span className="src-tag" style={{ color: 'var(--green)' }}>✓ {c.answer} — merged into PRD, completeness recalculated</span>
                    ) : (
                      <>
                        <div className="qrow">
                          <div className="qactions">
                            <button className="btn btn-ghost btn-sm" onClick={() => toggleAnswer(p.id, i)}>Answer inline</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => sendQuestion(p.id, i, p.approver)}>Email to client</button>
                          </div>
                          <div className="assignee">
                            <span>Assigned</span>
                            <select value={c.assignee || ''} onChange={e => assignClar(p.id, i, e.target.value)}>
                              <option value="">Unassigned</option>
                              {team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </div>
                        </div>
                        {isAnswering && (
                          <div className="answer-box">
                            <div className="field" style={{ marginBottom: '8px' }}>
                              <textarea rows="2" placeholder="Type the client's answer — it will be merged into the PRD with a citation…"
                                value={answers[key] || ''} onChange={e => setAnswers(a => ({ ...a, [key]: e.target.value }))} />
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={() => saveAnswer(p.id, i)}>Save answer to PRD</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              <button className="btn btn-primary send" onClick={() => sendAll(p.id, p.approver, openCount)}>
                Send {openCount} open question(s) to {p.approver}
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}
