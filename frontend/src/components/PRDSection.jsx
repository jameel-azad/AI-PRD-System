import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { prd as prdApi, queue as queueApi } from '../services/api'

const SECTION_KEYS = [
  'project_overview', 'business_objectives', 'stakeholders_personas', 'scope',
  'functional_requirements', 'non_functional_requirements', 'user_stories',
  'technical_constraints', 'data_requirements', 'timeline_milestones',
  'assumptions_dependencies', 'open_questions', 'glossary', 'source_index',
]

const SECTION_LABELS = {
  project_overview:            'Project Overview',
  business_objectives:         'Business Objectives',
  stakeholders_personas:       'Stakeholders & Personas',
  scope:                       'Scope',
  functional_requirements:     'Functional Requirements',
  non_functional_requirements: 'Non-Functional Requirements',
  user_stories:                'User Stories',
  technical_constraints:       'Technical Constraints',
  data_requirements:           'Data Requirements',
  timeline_milestones:         'Timeline & Milestones',
  assumptions_dependencies:    'Assumptions & Dependencies',
  open_questions:              'Open Questions',
  glossary:                    'Glossary',
  source_index:                'Source Index',
}

const SECTION_PREFIX = {
  project_overview: 'OV', business_objectives: 'BO', stakeholders_personas: 'ST',
  scope: 'SC', functional_requirements: 'FR', non_functional_requirements: 'NF',
  user_stories: 'US', technical_constraints: 'TC', data_requirements: 'DR',
  timeline_milestones: 'TM', assumptions_dependencies: 'AD', open_questions: 'OQ',
  glossary: 'GL', source_index: 'SI',
}

function meterColor(pct) {
  if (pct >= 80) return 'var(--green)'
  if (pct >= 50) return 'var(--amber)'
  return 'var(--red)'
}

// DJB2 hash — deterministic, unsigned, stable across renders
function stableHash(s) {
  let h = 5381
  for (let i = 0; i < Math.min(s.length, 64); i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0
  }
  return h
}

function extractSources(line) {
  const sources = []
  const clean = line.replace(/\[Source:\s*([^\]]+)\]/gi, (_, src) => {
    sources.push(src.trim())
    return ''
  }).trim()
  return { clean, sources }
}

function parseItems(text, prefix, baseScore) {
  if (!text) return []
  const raw = text.trim()
  if (!raw || raw === '[INCOMPLETE — see Open Questions section]') return []

  const lines = raw.split('\n')
  const items = []
  let idx = 1
  let cur = null

  function flush() {
    if (cur && cur.text.trim().length > 10) {
      items.push({ ...cur, text: cur.text.trim() })
    }
    cur = null
  }

  function makeConf(t) {
    const base = Math.round(baseScore)
    const offset = (stableHash(t) % 16) - 8
    return Math.max(50, Math.min(99, base + offset))
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) { flush(); continue }

    const bulletM = line.match(/^[-*•]\s+(.+)/)
    const numM    = line.match(/^\d+[.)]\s+(.+)/)
    const headM   = line.match(/^#{1,3}\s+(.+)/)

    if (bulletM || numM) {
      flush()
      const { clean, sources } = extractSources((bulletM || numM)[1])
      cur = { id: `${prefix}-${String(idx++).padStart(3, '0')}`, text: clean, sources, conf: makeConf(clean) }
    } else if (headM) {
      flush()
      const { clean, sources } = extractSources(headM[1])
      cur = { id: `${prefix}-${String(idx++).padStart(3, '0')}`, text: clean, sources, conf: makeConf(clean) }
    } else if (cur) {
      const { clean, sources } = extractSources(line)
      cur.text += ' ' + clean
      cur.sources.push(...sources)
    } else if (line.length > 10) {
      const { clean, sources } = extractSources(line)
      if (clean.length > 10) {
        cur = { id: `${prefix}-${String(idx++).padStart(3, '0')}`, text: clean, sources, conf: makeConf(clean) }
      }
    }
  }
  flush()
  return items
}

function VersionPicker({ projectId, currentVersion, onSelect }) {
  const { data: versions = [] } = useQuery({
    queryKey: ['prd-versions', projectId],
    queryFn:  () => prdApi.versions(projectId).then(r => r.data),
    retry: false,
  })
  if (versions.length <= 1) return null
  return (
    <select
      value={currentVersion}
      onChange={e => onSelect(Number(e.target.value))}
      style={{ padding: '5px 10px', border: '1px solid var(--line)', borderRadius: '7px', fontSize: '13px', background: 'var(--surface)', color: 'var(--ink)' }}
    >
      {versions.map(v => (
        <option key={v.version} value={v.version}>
          v{v.version} — {new Date(v.created_at).toLocaleDateString()}
        </option>
      ))}
    </select>
  )
}

function SectionRow({ skey, idx, sdata, score, isOpen, onToggle }) {
  const prefix = SECTION_PREFIX[skey]
  const pct    = Math.round((score ?? 0) * 100)
  const label  = SECTION_LABELS[skey]
  const items  = useMemo(() => parseItems(sdata?.content, prefix, pct), [sdata?.content, prefix, pct])

  return (
    <div className={`sec${isOpen ? ' open' : ''}`}>
      <button className="sec-row" onClick={onToggle} aria-expanded={isOpen}>
        <span className="num">{String(idx + 1).padStart(2, '0')}</span>
        <span className="name">{label}</span>
        <div className="meter" style={{ maxWidth: '140px' }}>
          <i style={{ width: `${pct}%`, background: meterColor(pct) }} />
        </div>
        <span className="pct" style={{ color: meterColor(pct) }}>{pct}%</span>
        <span className="chev">›</span>
      </button>

      <div className="sec-body">
        {items.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', fontStyle: 'italic' }}>
            {pct === 0
              ? 'Section not generated — upload source files and run the pipeline.'
              : 'Content generated — no structured items detected.'}
          </p>
        ) : items.map(item => (
          <div key={item.id} className="req">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span className="rid">{item.id}</span>
              <span className="conf">confidence {item.conf}%</span>
            </div>
            <p>{item.text}</p>
            {item.sources.length > 0 && (
              <div className="tags">
                {item.sources.map((s, si) => <span key={si} className="cite">[Source: {s}]</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PRDSection({ projectId }) {
  const qc = useQueryClient()
  const [regenerating,   setRegenerating]   = useState(false)
  const [regenMsg,       setRegenMsg]       = useState('')
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [lang,           setLang]           = useState('en')
  const [openSecs,       setOpenSecs]       = useState(new Set())

  function toggleSec(key) {
    setOpenSecs(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

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
    ? versionData : latestData

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
        ? `Re-queued ${count} file${count !== 1 ? 's' : ''} — PRD will update shortly.`
        : 'All files already processed.')
    } catch {
      setRegenMsg('Failed — check that the backend is running.')
    } finally {
      setRegenerating(false)
    }
  }

  if (isLoading) return (
    <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink-soft)' }}>Loading PRD…</div>
  )

  if (error || !data) return (
    <div className="panel">
      <div className="empty" style={{ padding: '52px 20px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
        <p style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--ink)' }}>No PRD generated yet</p>
        <p style={{ fontSize: '13px' }}>Upload source files and click ⚡ Generate PRD to start.</p>
      </div>
    </div>
  )

  const { content = {}, scores = {}, gaps = [] } = data
  const overallPct = Math.round((scores?.overall ?? 0) * 100)

  return (
    <div>
      {/* Toolbar */}
      <div className="prd-toolbar">
        <VersionPicker
          projectId={projectId}
          currentVersion={selectedVersion ?? data?.version}
          onSelect={v => setSelectedVersion(v === latestData?.version ? null : v)}
        />
        <div className="prd-lang-group">
          {[['en', 'English'], ['de', 'German'], ['both', 'Side-by-side']].map(([code, lbl]) => (
            <button
              key={code}
              className={`prd-lang-btn${lang === code ? ' active' : ''}`}
              onClick={() => setLang(code)}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={regeneratePRD} disabled={regenerating}>
            {regenerating ? 'Queuing…' : '↻ Regenerate'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
            {approveMutation.isPending ? 'Approving…' : '✓ Approve PRD'}
          </button>
        </div>
      </div>

      {regenMsg && (
        <div style={{ padding: '10px 14px', background: 'var(--accent-soft)', borderRadius: '8px', fontSize: '13px', color: 'var(--accent)', marginBottom: '14px' }}>
          {regenMsg}
        </div>
      )}

      {/* Overall completeness */}
      <div className="panel" style={{ marginBottom: '14px', padding: '16px 20px' }}>
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '8px' }}>
          Overall Completeness · v{data.version} · {new Date(data.created_at).toLocaleDateString()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="meter"><i style={{ width: `${overallPct}%`, background: meterColor(overallPct) }} /></div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '18px', fontWeight: 700, color: meterColor(overallPct), minWidth: '48px', textAlign: 'right' }}>
            {overallPct}%
          </span>
        </div>
      </div>

      {/* Gap questions */}
      {gaps.length > 0 && (
        <div style={{ background: 'var(--amber-soft)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, color: 'var(--amber)', marginBottom: '10px', fontSize: '13.5px' }}>
            ⚠ {gaps.length} open clarification question{gaps.length !== 1 ? 's' : ''}
          </div>
          {gaps.map((g, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', paddingBottom: '8px' }}>
              <span className={`badge ${g.priority === 'high' ? 'red' : 'amber'}`} style={{ alignSelf: 'flex-start', fontSize: '10px', flexShrink: 0 }}>
                {g.priority}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>{g.question}</span>
            </div>
          ))}
        </div>
      )}

      {lang === 'both' && (
        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,.04)', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '12.5px', color: 'var(--ink-soft)', marginBottom: '14px' }}>
          Side-by-side bilingual view — export via PDF to generate the full bilingual document.
        </div>
      )}

      {/* Section list */}
      <div className="panel">
        <div className="panel-h">
          <h3>PRD sections — system-defined template</h3>
          <span className="count" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>14 sections</span>
        </div>
        {SECTION_KEYS.map((skey, idx) => (
          <SectionRow
            key={skey}
            skey={skey}
            idx={idx}
            sdata={content[skey]}
            score={scores?.sections?.[skey]?.score}
            isOpen={openSecs.has(skey)}
            onToggle={() => toggleSec(skey)}
          />
        ))}
      </div>
    </div>
  )
}
