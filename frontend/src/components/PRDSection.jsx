import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { prd as prdApi, queue as queueApi } from '../services/api'

function VersionPicker({ projectId, currentVersion, onSelect }) {
  const { data: versions = [] } = useQuery({
    queryKey: ['prd-versions', projectId],
    queryFn:  () => prdApi.versions(projectId).then(r => r.data),
    retry: false,
  })
  if (versions.length <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px' }}>
      <span style={{ color: 'var(--ink-soft)' }}>Version:</span>
      <select
        value={currentVersion}
        onChange={e => onSelect(Number(e.target.value))}
        style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: '5px', fontSize: '13px', background: 'var(--surface)', color: 'var(--ink)' }}
      >
        {versions.map(v => (
          <option key={v.version} value={v.version}>
            v{v.version} — {new Date(v.created_at).toLocaleDateString()}
          </option>
        ))}
      </select>
    </div>
  )
}

const SECTION_LABELS = {
  project_overview: 'Project Overview', business_objectives: 'Business Objectives',
  stakeholders_personas: 'Stakeholders & Personas', scope: 'Scope',
  functional_requirements: 'Functional Requirements', non_functional_requirements: 'Non-Functional Requirements',
  user_stories: 'User Stories', technical_constraints: 'Technical Constraints',
  data_requirements: 'Data Requirements', timeline_milestones: 'Timeline & Milestones',
  assumptions_dependencies: 'Assumptions & Dependencies', open_questions: 'Open Questions',
  glossary: 'Glossary', source_index: 'Source Index',
}

function CompletenessBar({ score = 0 }) {
  const pct  = Math.round(score * 100)
  const color = score >= 0.8 ? 'bg-green-500' : score >= 0.4 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium w-8 text-right ${score >= 0.8 ? 'text-green-600' : score >= 0.4 ? 'text-amber-600' : 'text-red-500'}`}>
        {pct}%
      </span>
    </div>
  )
}

function Section({ title, data, score }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900">{title}</span>
        <div className="flex items-center gap-4 ml-4 min-w-[140px]">
          <CompletenessBar score={score} />
          <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
          {data?.content
            ? <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{data.content}</p>
            : <p className="text-sm text-gray-400 italic">[INCOMPLETE — see Open Questions section]</p>}
        </div>
      )}
    </div>
  )
}

export default function PRDSection({ projectId }) {
  const qc = useQueryClient()
  const [regenerating, setRegenerating] = useState(false)
  const [regenMsg, setRegenMsg] = useState('')
  const [selectedVersion, setSelectedVersion] = useState(null)

  const { data: latestData, isLoading, error } = useQuery({
    queryKey: ['prd', projectId],
    queryFn:  () => prdApi.get(projectId).then(r => r.data),
    retry: false,
  })

  const { data: versionData } = useQuery({
    queryKey: ['prd-version', projectId, selectedVersion],
    queryFn:  () => prdApi.getVersion(projectId, selectedVersion).then(r => r.data),
    enabled:  selectedVersion !== null && selectedVersion !== latestData?.version,
    retry: false,
  })

  const data = (selectedVersion !== null && selectedVersion !== latestData?.version && versionData)
    ? versionData
    : latestData

  const approveMutation = useMutation({
    mutationFn: () => prdApi.approve(projectId, {}),
    onSuccess:  () => qc.invalidateQueries(['prd', projectId]),
  })

  async function regeneratePRD() {
    setRegenerating(true)
    setRegenMsg('')
    try {
      const { data: result } = await queueApi.reprocess(projectId)
      const count = result.queued?.length ?? 0
      setRegenMsg(count > 0
        ? `Re-queued ${count} file${count !== 1 ? 's' : ''} — PRD will update when processing completes.`
        : 'All files already processed. No files to re-queue.')
    } catch {
      setRegenMsg('Failed to re-queue files — check that the backend is running.')
    } finally {
      setRegenerating(false)
    }
  }

  if (isLoading) return <div className="text-center py-12 text-gray-400">Loading PRD…</div>
  if (error)     return (
    <div className="text-center py-12">
      <p className="text-gray-500">No PRD generated yet.</p>
      <p className="text-sm text-gray-400 mt-1">Upload source files and wait for the pipeline to complete.</p>
    </div>
  )

  const { content = {}, scores = {}, gaps = [] } = data

  const overall = scores?.overall ?? 0
  const overallColor = overall >= 0.8 ? 'bg-green-100 text-green-800 border-green-200'
    : overall >= 0.4 ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-red-100 text-red-800 border-red-200'

  return (
    <div className="space-y-6">
      <VersionPicker
        projectId={projectId}
        currentVersion={selectedVersion ?? data?.version}
        onSelect={v => setSelectedVersion(v === latestData?.version ? null : v)}
      />
      {/* Overall score banner */}
      <div className={`rounded-xl border px-6 py-4 flex items-center justify-between gap-3 flex-wrap ${overallColor}`}>
        <div>
          <p className="font-semibold">Overall Completeness: {Math.round(overall * 100)}%</p>
          <p className="text-sm mt-0.5 opacity-80">Version {data.version} · Generated {new Date(data.created_at).toLocaleString()}</p>
          {regenMsg && <p className="text-sm mt-1 font-medium">{regenMsg}</p>}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={regeneratePRD}
            disabled={regenerating}
            className="bg-white border border-current px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {regenerating ? 'Queuing…' : '↻ Regenerate PRD'}
          </button>
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="bg-white border border-current px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {approveMutation.isPending ? 'Approving…' : 'Approve PRD'}
          </button>
        </div>
      </div>

      {/* Gap questions */}
      {gaps.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="font-semibold text-amber-800 mb-3">Open Clarification Questions ({gaps.length})</p>
          <ul className="space-y-2">
            {gaps.map((g, i) => (
              <li key={i} className="text-sm text-amber-700 flex gap-2">
                <span className={`px-1.5 rounded text-xs font-medium self-start mt-0.5 ${
                  g.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>{g.priority}</span>
                <span>{g.question}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {Object.entries(SECTION_LABELS).map(([key, label]) => (
          <Section
            key={key} title={label}
            data={content[key]}
            score={scores?.sections?.[key]?.score ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
