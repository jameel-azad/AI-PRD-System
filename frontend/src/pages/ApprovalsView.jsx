import { useNavigate } from 'react-router-dom'
import useProjectStore from '../store/projectStore'
import useAppStore from '../store/appStore'
import useAuthStore from '../store/authStore'
import { FeasBadge } from '../components/Badge'
import { prd as prdApi, projects as projectsApi } from '../services/api'

const STAGE_LABELS = {
  intake: 'Intake', processing: 'Processing', drafted: 'Drafted',
  gap_review: 'Gap Review', feasibility: 'Feasibility', client_review: 'Client Review', approved: 'Approved',
}

export default function ApprovalsView() {
  const navigate = useNavigate()
  const { projects, initFromApi } = useProjectStore()
  const { showToast } = useAppStore()
  const viewRole = useAuthStore(s => s.viewRole)

  // Show projects that are in client_review or approved stage
  const reviewProjects = projects.filter(p => p.stage >= 5)

  if (reviewProjects.length === 0) {
    return (
      <div className="panel">
        <div className="empty">
          No projects are currently pending approval. Submit a PRD for client review from a project workspace.
        </div>
      </div>
    )
  }

  async function handleApprove(p) {
    try {
      await prdApi.approve(p.id, { comment: 'Approved via approvals portal' })
      showToast(`PRD approved for ${p.name}`)
      await initFromApi()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Approval failed — check your role permissions', 'error')
    }
  }

  async function handleWithdraw(p) {
    try {
      await projectsApi.updateStage(p.id, 'feasibility')
      showToast('PRD withdrawn from client review')
      await initFromApi()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Withdrawal failed', 'error')
    }
  }

  return (
    <div className="appr">
      {reviewProjects.map(p => {
        const isApproved = p.stage >= 6
        const stageKey = ['intake','processing','drafted','gap_review','feasibility','client_review','approved'][p.stage] || 'client_review'

        return (
          <div key={p.id} className="appr-card">
            <div className="info">
              <h4>
                {p.name}{' '}
                <FeasBadge score={p.feas} />
                {isApproved && <span className="badge green" style={{marginLeft:'8px'}}><span className="dot" />Approved</span>}
              </h4>
              <div className="meta">
                Client: <b>{p.client || p.client_org || '—'}</b> · Stage: <b>{STAGE_LABELS[stageKey]}</b>
                {p.approver && p.approver !== '—' && <> · Approver: <b>{p.approver}</b></>}
              </div>
            </div>
            <div className="acts">
              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/projects/${p.id}/prd`)}>
                Open PRD
              </button>
              {!isApproved && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => handleApprove(p)}>
                    Approve PRD
                  </button>
                  {viewRole !== 'client' && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleWithdraw(p)}>
                      Withdraw submission
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
