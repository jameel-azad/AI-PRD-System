import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useProjectStore from '../store/projectStore'
import useAppStore from '../store/appStore'
import { FeasBadge } from '../components/Badge'

export default function ApprovalsView() {
  const navigate = useNavigate()
  const { projects, updateProject, addProjectActivity } = useProjectStore()
  const { showToast, openModal } = useAppStore()
  const [showRecord, setShowRecord] = useState(false)

  const med = projects.find(p => p.id === 'medaxis')
  const nim = projects.find(p => p.id === 'nimbus')
  const vol = projects.find(p => p.id === 'volkov')

  function remind(p) {
    showToast(`Reminder email sent to ${p.approver}`)
    addProjectActivity(p.id, { ico: '🔔', c: 'amber-soft', cl: 'var(--amber)', txt: 'Manual reminder sent to client', time: 'Just now' })
  }

  function withdraw(p) {
    updateProject(p.id, proj => ({ ...proj, status: 'draft', statusLabel: 'Draft · withdrawn from review', stage: Math.min(proj.stage, 4) }))
    showToast('PRD withdrawn from client review')
  }

  function newVersion(p) {
    updateProject(p.id, proj => ({ ...proj, status: 'draft', statusLabel: 'Draft · v1.1 (unlocked for edits)' }))
    addProjectActivity(p.id, { ico: '📄', c: 'violet-soft', cl: 'var(--violet)', txt: 'New version v1.1 created — PRD unlocked', time: 'Just now' })
    showToast('New version created — PRD unlocked for edits')
  }

  function exportPdf(p) {
    showToast(`Generating versioned PDF export…`)
    setTimeout(() => showToast(`Exported ${p.name.replace(/\s+/g,'_')}_PRD.pdf`), 1100)
  }

  if (!med || !nim || !vol) return null

  return (
    <div className="appr">
      {/* MedAxis — in review */}
      <div className="appr-card">
        <div className="info">
          <h4>{med.name} <FeasBadge score="amber" /></h4>
          <div className="meta">
            Submitted for approval Jun 11 · Approver: <b>Lena Weber</b> ({med.approver}) · Deadline <b>Jun 16</b><br />
            Reminders: after 2 and 5 days · PRD v0.9 · click-to-approve, complete document only
          </div>
        </div>
        <div className="acts">
          <button className="btn btn-ghost btn-sm" onClick={() => remind(med)}>Send reminder now</button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/projects/${med.id}/prd`)}>Open PRD</button>
          <button className="btn btn-danger btn-sm" onClick={() => withdraw(med)}>Withdraw submission</button>
        </div>
      </div>

      {/* Nimbus — approved */}
      <div className="appr-card">
        <div className="info">
          <h4>{nim.name} <span className="badge green"><span className="dot" />Approved</span></h4>
          <div className="meta">Approved and <b>locked</b> — further changes require a new version (v1.1 draft)</div>
        </div>
        <div className="acts">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRecord(v => !v)}>View approval record</button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportPdf(nim)}>Download versioned PDF</button>
          <button className="btn btn-ghost btn-sm" onClick={() => newVersion(nim)}>Create new version</button>
        </div>
        {showRecord && nim.approval && (
          <div className="record" style={{ width: '100%' }}>
            {`APPROVAL RECORD\n— Approver : ${nim.approval.by} <${nim.approval.email}>\n— Date/Time: ${nim.approval.date}\n— PRD ver. : ${nim.approval.version} (locked)\n— Method   : click-to-approve (no e-signature)\n— Stored   : audit log entry #84112`}
          </div>
        )}
      </div>

      {/* Volkov — blocked */}
      <div className="appr-card">
        <div className="info">
          <h4>{vol.name} <FeasBadge score="red" /></h4>
          <div className="meta">
            <span className="overdue">Submission locked.</span> Hard blocker from feasibility analysis (OFAC SDN match). Resolve or request Admin override before this PRD can be sent for client approval.
          </div>
        </div>
        <div className="acts">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/projects/${vol.id}/feasibility`)}>View feasibility report</button>
          <button className="btn btn-danger btn-sm" onClick={() => openModal('override')}>Request Admin override</button>
        </div>
      </div>
    </div>
  )
}
