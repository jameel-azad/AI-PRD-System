import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import useProjectStore from '../store/projectStore'
import useAppStore from '../store/appStore'
import { prd as prdApi, projects as projectsApi } from '../services/api'

const PRIORITY_COLOR = {
  high:   'red',
  medium: 'amber',
  low:    'gray',
}

function GapItem({ gap, gapKey, projectId, savedAnswer }) {
  const queryClient = useQueryClient()
  const { showToast } = useAppStore()
  const [draft, setDraft] = useState(savedAnswer || '')
  const [editing, setEditing] = useState(!savedAnswer)

  const mutation = useMutation({
    mutationFn: () => projectsApi.answerGap(projectId, gapKey, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gap-answers', projectId] })
      setEditing(false)
      showToast('Answer saved')
    },
    onError: () => showToast('Failed to save answer', 'error'),
  })

  return (
    <div className="q" style={{ opacity: savedAnswer && !editing ? 0.85 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
        <span className={`prio ${PRIORITY_COLOR[gap.priority] || 'gray'}`}>
          {gap.priority || 'medium'} priority
        </span>
        {gap.section && (
          <span className="src-tag">{gap.section.replace(/_/g, ' ')}</span>
        )}
        {savedAnswer && !editing && (
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--green)', fontWeight: 600 }}>✓ Answered</span>
        )}
      </div>
      <p style={{ marginTop: '8px', marginBottom: '10px' }}>{gap.question}</p>

      {editing ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Type your answer…"
            rows={2}
            style={{
              flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '6px',
              fontSize: '13px', background: 'var(--surface)', color: 'var(--ink)', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !draft.trim()}
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
            {savedAnswer && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(savedAnswer); setEditing(false) }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-soft)', flex: 1 }}>{savedAnswer}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
        </div>
      )}
    </div>
  )
}

function ProjectClarifications({ project }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: prdData, isLoading: prdLoading } = useQuery({
    queryKey: ['prd', project.id],
    queryFn: () => prdApi.get(project.id).then(r => r.data),
    retry: false,
  })

  const { data: answersData } = useQuery({
    queryKey: ['gap-answers', project.id],
    queryFn: () => projectsApi.get(project.id).then(r => r.data.gap_answers || {}),
    retry: false,
  })

  if (prdLoading) {
    return <div className="panel"><div className="empty">Loading clarifications…</div></div>
  }

  if (!prdData) return null

  const gaps = prdData.gaps || []
  if (gaps.length === 0) return null

  const answers = answersData || {}

  return (
    <div>
      <div className="section-head" style={{ marginTop: '6px' }}>
        <h3>
          {project.name}
          <span style={{ fontWeight: 500, color: 'var(--ink-soft)', fontSize: '13px' }}>
            {' '}· {project.client || project.client_org || ''}
          </span>
        </h3>
        <button className="all" onClick={() => navigate(`/projects/${project.id}/prd`)}>Open PRD →</button>
      </div>
      <div className="panel" style={{ marginBottom: '24px' }}>
        {gaps.map((g, i) => {
          const gapKey = String(i)
          return (
            <GapItem
              key={i}
              gap={g}
              gapKey={gapKey}
              projectId={project.id}
              savedAnswer={answers[gapKey] || ''}
            />
          )
        })}
      </div>
    </div>
  )
}

export default function ClarificationsView() {
  const { projects } = useProjectStore()

  if (projects.length === 0) {
    return (
      <div className="panel">
        <div className="empty">No projects yet. Create a project and upload source files to generate PRD clarification questions.</div>
      </div>
    )
  }

  return (
    <>
      {projects.map(p => (
        <ProjectClarifications key={p.id} project={p} />
      ))}
      <div className="panel">
        <div className="empty">
          Clarification questions are generated by the AI pipeline from PRD gap analysis. Upload source files and run the pipeline to populate questions here.
        </div>
      </div>
    </>
  )
}
