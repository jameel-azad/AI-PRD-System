import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import useProjectStore from '../store/projectStore'
import useAuthStore from '../store/authStore'
import useAppStore from '../store/appStore'
import { FeasBadge, MeterColor, Avatar, AvatarStack } from '../components/Badge'
import { STAGES, STAGE_BADGE, FLOW, SECTION_NAMES } from '../data/mockData'
import { exportPrd, files as filesApi, prd as prdApi, projects as projectsApi, queue as queueApi } from '../services/api'
import PRDSection from '../components/PRDSection'
import FeasibilityPanel from '../components/FeasibilityPanel'
import DiscussionThread from '../components/DiscussionThread'
import { renderBoldText } from '../utils/renderBoldText'

const INDEX_TO_STAGE = ['intake', 'processing', 'drafted', 'gap_review', 'feasibility', 'client_review', 'approved']

/* ---- Export button ---- */
function ExportButton({ projectId, projectName }) {
  const { busyToast, showToast } = useAppStore()
  const [open, setOpen] = useState(false)

  async function doExport(fmt) {
    setOpen(false)
    busyToast(`Exporting ${fmt.toUpperCase()}…`)
    try {
      const res = await exportPrd.download(projectId, fmt)
      const url = URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] }))
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      a.download = match ? match[1] : `${projectName.replace(/\s+/g, '_')}_PRD.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
      showToast(`Exported ${a.download}`)
    } catch {
      showToast('Export failed — make sure the pipeline has completed first', 'error')
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn btn-ghost" onClick={() => setOpen(o => !o)}>
        Export ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '4px',
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          zIndex: 200, minWidth: '130px', overflow: 'hidden',
        }}>
          {[['pdf','PDF'], ['docx','Word (DOCX)'], ['md','Markdown']].map(([fmt, label]) => (
            <button key={fmt} onClick={() => doExport(fmt)} style={{
              display: 'block', width: '100%', padding: '9px 16px', textAlign: 'left',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13.5px', color: 'var(--ink)',
            }}
            onMouseEnter={e => e.target.style.background = 'var(--surface)'}
            onMouseLeave={e => e.target.style.background = 'none'}
            >{label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---- helpers ---- */
function mk(t) {
  if (t === 'clear') return <span style={{color:'var(--green)'}}>✔</span>
  if (t === 'warn')  return <span style={{color:'var(--amber)'}}>⚠</span>
  if (t === 'block') return <span style={{color:'var(--red)'}}>⛔</span>
  return <span style={{color:'var(--ink-soft)'}}>ℹ</span>
}

function feasRemedy(key, type, text='') {
  const t = text.toLowerCase()
  if (key === 'sanctions') return type === 'block'
    ? 'Escalate to an Admin for sanctions review. Confirm the flagged parent/counterparty, obtain legal sign-off, or route the engagement through a licensed partner before submission.'
    : 'Document the sectoral-measure exposure, confirm the counterparty falls outside restricted scope, and attach the screening evidence to the PRD.'
  if (key === 'geo') {
    if (t.includes('residency') || t.includes('localization') || t.includes('sovereignty')) return 'Pin the data-residency region and add a data-residency non-functional requirement to PRD §6.'
    if (type === 'block') return 'Restructure the deployment / export path to avoid the restricted transfer and obtain an export-control opinion before proceeding.'
    return 'Record the restriction in §8 Technical Constraints and confirm payment / transfer channels are compliant.'
  }
  if (key === 'reg') return 'Inject the applicable compliance requirement into PRD §6 and assign an owner to close it.'
  return 'Review the latest regulatory update and confirm it does not change scope; cite it in the PRD if relevant.'
}

function feasActionsFor(p) {
  if (!p.feasReport) return []
  const cats = [['sanctions','Sanctions'],['geo','Geopolitical'],['reg','Regulatory'],['web','Market / web']]
  const out = []
  cats.forEach(([key, label]) => {
    ;(p.feasReport[key] || []).forEach((item, idx) => {
      const [type, text] = item
      if (type === 'block' || type === 'warn') {
        out.push({ id: `${key}-${idx}`, cat: label, key, idx, sev: type, finding: text, rec: feasRemedy(key, type, text) })
      }
    })
  })
  return out.sort((a, b) => (a.sev === 'block' ? 0 : 1) - (b.sev === 'block' ? 0 : 1))
}

/* ============ OVERVIEW TAB ============ */
function TabOverview({ p, navigate }) {
  const { userById, updateProject } = useProjectStore()
  const { showToast } = useAppStore()
  const [triggering, setTriggering] = useState(false)

  // Auto-poll every 4s while any file is not yet done (queue or processing)
  const isProcessing = (p.inputs ?? []).some(f => f.stat !== 'done' && f.stat !== 'err')
  const pollRef = useRef(null)
  useEffect(() => {
    if (!isProcessing) { clearInterval(pollRef.current); return }
    const STAGE_MAP = { intake: 0, processing: 1, drafted: 2, gap_review: 3, feasibility: 4, client_review: 5, approved: 6 }
    async function poll() {
      try {
        const { data } = await projectsApi.get(p.id)
        updateProject(p.id, proj => ({
          ...proj,
          stage: STAGE_MAP[data.stage] ?? proj.stage,
          inputs: (data.files || []).map(f => ({
            fileId: f.id, name: f.filename, kind: f.file_type, size: '—',
            stat: f.status === 'complete' ? 'done' : f.status === 'failed' ? 'err' : f.status === 'processing' ? 'proc' : 'queue',
            prog: f.status === 'complete' ? 100 : 0, meta: f.status,
          })),
        }))
      } catch { /* silent — don't toast on background polls */ }
    }
    pollRef.current = setInterval(poll, 4000)
    return () => clearInterval(pollRef.current)
  }, [isProcessing, p.id])

  // Derive pipeline stage display from real file statuses instead of mock flowState
  const anyProc = (p.inputs ?? []).some(f => f.stat === 'proc')
  const anyQueued = (p.inputs ?? []).some(f => f.stat === 'queue')
  const anyDone = (p.inputs ?? []).some(f => f.stat === 'done')
  const derivedFlowState = (p.stage ?? 0) >= 2 || anyDone
    ? [1, 1, 1, 1, 1, 1, 1, 1]
    : anyProc
      ? [1, 2, 2, 2, 0, 0, 0, 0]  // ingestion done, pipeline running
      : anyQueued
        ? [2, 0, 0, 0, 0, 0, 0, 0]  // ingestion queued
        : [0, 0, 0, 0, 0, 0, 0, 0]

  async function triggerPipeline() {
    setTriggering(true)
    try {
      const { data } = await queueApi.reprocess(p.id)
      const count = data.queued?.length ?? 0
      showToast(count > 0 ? `Processing queued for ${count} file${count !== 1 ? 's' : ''} — PRD will regenerate shortly` : 'Pipeline triggered — PRD generation queued')
    } catch {
      showToast('Could not trigger pipeline — backend may be unavailable', 'error')
    } finally {
      setTriggering(false)
    }
  }

  const stepper = (
    <div className="stepper">
      {STAGES.map((s, i) => {
        const cls = i < p.stage ? 'done' : i === p.stage ? 'cur' : 'pending'
        return (
          <div key={i} className={`step ${cls}`}>
            <div className="dot">{i < p.stage ? '✓' : String(i + 1)}</div>
            <div className="slabel">{s}</div>
            <div className="ssub">{i < p.stage ? 'done' : i === p.stage ? 'current' : ''}</div>
          </div>
        )
      })}
    </div>
  )

  const flow = (
    <div className="panel" style={{marginBottom:'18px'}}>
      <div className="panel-h">
        <h3>AI processing pipeline</h3>
        <span className="count" style={{background:'var(--blue-soft)',color:'var(--blue)'}}>data flow</span>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={triggerPipeline} disabled={triggering}>
          {triggering ? 'Queuing…' : '⚡ Generate PRD'}
        </button>
      </div>
      <div className="flow">
        {FLOW.map(([ico, name, meta], i) => {
          const st = derivedFlowState[i]; const k = st===1?'done':st===2?'run':'wait'; const lbl = st===1?'done':st===2?'running':'queued'
          return (
            <div key={i} className="flow-stage">
              <div className={`flow-ico ${k}`}>{ico}</div>
              <div className="flow-body"><b>{name}</b><div className="fmeta">{meta}</div></div>
              <div className={`flow-stat ${k}`}>{lbl}</div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const teamUsers = p.team.map(id => userById(id)).filter(Boolean)

  return (
    <>
      {stepper}
      {flow}
      <div className="set-grid">
        <div className="set-card">
          <h4>Inputs linked to this PRD</h4>
          {p.inputs.slice(0, 4).map((f) => (
            <div key={f.fileId ?? f.name} className="switchrow">
              <span><b>{f.name}</b><small>{f.meta}</small></span>
              <span className={`badge ${f.stat==='done'?'green':'blue'}`}><span className="dot" />{f.stat==='done'?'Indexed':'Processing'}</span>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{marginTop:'12px'}} onClick={() => navigate(`/projects/${p.id}/inputs`)}>Manage inputs →</button>
        </div>
        <div className="set-card">
          <h4>Project team</h4>
          {teamUsers.map(u => (
            <div key={u.id} className="switchrow">
              <span style={{display:'flex',alignItems:'center',gap:'9px'}}>
                <Avatar user={u} size="sm" />
                <span><b>{u.name}</b><small>{u.roleLabel}</small></span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* ============ INPUTS TAB ============ */
/* ---- file type SVG icons ---- */
function FileTypeIcon({ kind }) {
  if (kind === 'video') return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 9l5-3v12l-5-3V9z"/>
    </svg>
  )
  if (kind === 'audio') return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  )
  /* document / text / default */
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  )
}

const FR_ICON_STYLE = {
  video:    { background: 'rgba(59,130,246,.14)',  color: '#60a5fa' },
  audio:    { background: 'rgba(168,85,247,.14)',  color: '#c084fc' },
  document: { background: 'rgba(34,197,94,.10)',   color: '#4ade80' },
  text:     { background: 'rgba(251,191,36,.10)',  color: '#fbbf24' },
}

function fileMeta(f) {
  const parts = []
  if (f.size && f.size !== '—') parts.push(f.size)
  if (f.stat === 'done') {
    if (f.kind === 'video' || f.kind === 'audio') parts.push('transcribed', 'PII-redacted')
    else parts.push('parsed')
  } else if (f.stat === 'proc') {
    parts.push('extracting entities…')
  } else if (f.stat === 'queue') {
    parts.push('queued for processing')
  } else if (f.stat === 'err') {
    parts.push('processing failed')
  }
  return parts.join(' · ')
}

function TabInputs({ p }) {
  const { openModal, showToast } = useAppStore()
  const { updateProject } = useProjectStore()
  const [reprocessing,    setReprocessing]    = useState(false)
  const [deletingId,      setDeletingId]      = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [dragOver,        setDragOver]        = useState(false)

  async function runAnalysis() {
    setReprocessing(true)
    try {
      const { data } = await queueApi.reprocess(p.id)
      const count = data.queued?.length ?? 0
      showToast(count > 0
        ? `Pipeline queued for ${count} file${count !== 1 ? 's' : ''} — PRD will update shortly`
        : 'All files already processed — nothing queued')
    } catch {
      showToast('Could not start pipeline — backend may be unavailable', 'error')
    } finally {
      setReprocessing(false)
    }
  }

  async function deleteFile(fileId) {
    setConfirmDeleteId(null)
    setDeletingId(fileId)
    try {
      await filesApi.delete(fileId)
      updateProject(p.id, proj => ({ ...proj, inputs: proj.inputs.filter(f => f.fileId !== fileId) }))
      showToast('File removed')
    } catch {
      showToast('Could not delete file', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  function onDragOver(e) { e.preventDefault(); setDragOver(true) }
  function onDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }
  function onDrop(e) { e.preventDefault(); setDragOver(false); openModal('upload', { projId: p.id }) }

  return (
    <>
      {/* ── Drop zone ── */}
      <div
        className={`dz2${dragOver ? ' dz2-over' : ''}`}
        onClick={() => openModal('upload', { projId: p.id })}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="dz2-ico">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <path d="M17 8l-5-5-5 5M12 3v12"/>
          </svg>
        </div>
        <h4 className="dz2-title">Drop files or click to upload</h4>
        <p className="dz2-sub">Each file is transcribed, chunked, source-tagged and merged into the PRD.</p>
        <div className="dz-types">
          <span className="src">🎥 Video ≤1GB</span>
          <span className="src">🎙 Audio ≤500MB</span>
          <span className="src">📄 Docs ≤50MB</span>
          <span className="src">📝 Paste text</span>
        </div>
      </div>

      {/* ── Source files panel ── */}
      <div className="panel" style={{ marginTop: '16px' }}>
        <div className="panel-h">
          <h3>Source files</h3>
          <span className="count" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {p.inputs.length}
          </span>
          <span className="spacer" />
          <button className="btn btn-primary btn-sm" onClick={runAnalysis} disabled={reprocessing}>
            {reprocessing ? 'Queuing…' : 'Run AI analysis'}
          </button>
        </div>

        {p.inputs.length === 0 ? (
          <div className="empty">No files yet — upload source files above to start the pipeline.</div>
        ) : (
          <div className="fr2-list">
            {p.inputs.map(f => {
              const iconStyle = FR_ICON_STYLE[f.kind] || FR_ICON_STYLE.document
              const isDone = f.stat === 'done'
              const isProc = f.stat === 'proc'
              const isErr  = f.stat === 'err'
              const statCls = isDone ? 'done' : isProc ? 'proc' : isErr ? 'err' : 'queue'
              const statLabel = isDone ? 'INDEXED' : isProc ? 'PROCESSING' : isErr ? 'ERROR' : 'QUEUED'

              return (
                <div key={f.fileId ?? f.name} className="fr2">
                  <div className="fr2-row">
                    <div className="fr2-ico" style={iconStyle}>
                      <FileTypeIcon kind={f.kind} />
                    </div>
                    <div className="fr2-body">
                      <span className="fr2-name">{f.name}</span>
                      <span className="fr2-meta">{fileMeta(f)}</span>
                    </div>
                    <span className={`fr2-badge ${statCls}`}>{statLabel}</span>

                    {f.fileId && (
                      confirmDeleteId === f.fileId ? (
                        <div className="fr2-confirm">
                          <button className="fr2-yes" onClick={() => deleteFile(f.fileId)} disabled={deletingId === f.fileId}>
                            {deletingId === f.fileId ? '…' : 'Delete'}
                          </button>
                          <button className="fr2-no" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button className="fr2-del" onClick={e => { e.stopPropagation(); setConfirmDeleteId(f.fileId) }} title="Remove file">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      )
                    )}
                  </div>

                  {isProc && (
                    <div className="fr2-prog">
                      <div className="fr2-prog-fill" style={{ width: `${f.prog || 15}%` }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="inputs-foot">
        Every requirement in the PRD links back to a timestamped position in one of these files — that's how source citations are generated.
      </p>
    </>
  )
}

/* ============ PRD TAB ============ */
function TabPRD({ p, navigate }) {
  const [openSecs, setOpenSecs] = useState(new Set([4, 5]))
  const [prdLang, setPrdLang] = useState('primary')
  const { updateInjected } = useProjectStore()
  const { showToast } = useAppStore()
  const viewRole = useAuthStore(s => s.viewRole)
  const isClient = viewRole === 'client'

  function toggleSec(i) {
    setOpenSecs(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  function injAct(j, state) {
    updateInjected(p.id, j, state)
    showToast(state === 'accepted' ? 'Compliance requirement accepted into §6' : 'Requirement removed')
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>PRD sections — system-defined template</h3>
        <span className="count" style={{background:'var(--accent-soft)',color:'var(--accent)'}}>14 sections</span>
      </div>
      {SECTION_NAMES.map((name, i) => {
        const sc = p.sections[i]
        const isOpen = openSecs.has(i)

        let body = null
        if (i === 4) {
          body = (
            <>
              {p.reqs.map((r, ri) => (
                <div key={ri} className="req">
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <span className="rid">{r.id}</span>
                    <span className="conf">confidence {r.conf}%</span>
                    <button className="commentbtn" onClick={() => navigate(`/projects/${p.id}/discussion`)}>💬 {r.comments || 0}</button>
                  </div>
                  <p>{r.text}</p>
                  <div className="tags">{r.cites.map((c, ci) => <span key={ci} className="cite">[Source: {c}]</span>)}</div>
                </div>
              ))}
              <p style={{fontSize:'12px',color:'var(--ink-soft)'}}>+ {8 + p.reqs.length} more requirements · every requirement carries a source citation.</p>
            </>
          )
        } else if (i === 5) {
          body = p.injected.length ? p.injected.map((r, j) => (
            <div key={j} className={`req injected ${r.state==='accepted'?'accepted':''} ${r.state==='removed'?'removed':''}`}>
              <span className="rid">{r.id}</span> <span className="conf">auto-injected</span>
              <p>{r.text}</p>
              <div className="tags"><span className="cite">[Source: Feasibility Agent | Regulation: {r.reg}]</span></div>
              {r.state === 'pending' && !isClient && (
                <div className="iactions">
                  <button className="btn btn-primary btn-sm" onClick={() => injAct(j, 'accepted')}>Accept</button>
                  <button className="btn btn-ghost btn-sm">Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => injAct(j, 'removed')}>Remove</button>
                </div>
              )}
              {r.state !== 'pending' && (
                <div style={{fontSize:'11.5px',fontWeight:700,marginTop:'8px',color:r.state==='accepted'?'var(--green)':'var(--red)'}}>
                  {r.state === 'accepted' ? '✓ Accepted into PRD' : '✗ Removed by BA/PM'}
                </div>
              )}
            </div>
          )) : <p style={{fontSize:'13px',color:'var(--ink-soft)'}}>Performance, security, scalability, availability. Run the feasibility analysis to auto-inject applicable compliance requirements.</p>
        } else if (i === 11) {
          body = p.clars.length ? (
            <>
              {p.clars.map((c, ci) => (
                <div key={ci} className="req">
                  <p>{c.q}</p>
                  <div className="tags">
                    <span className="cite">{c.gap}</span>
                    {c.state !== 'open' && <span className="conf">{c.state}</span>}
                  </div>
                </div>
              ))}
              {isClient
                ? <button className="btn btn-primary btn-sm" onClick={() => navigate(`/projects/${p.id}/discussion`)}>Answer these in Discussion →</button>
                : <button className="btn btn-ghost btn-sm" onClick={() => navigate('/clarifications')}>Answer in Clarifications →</button>
              }
            </>
          ) : <p style={{fontSize:'13px',color:'var(--ink-soft)'}}>No open questions — gap analysis found no missing sections.</p>
        } else if (i === 13) {
          body = (
            <div className="audit">
              {p.inputs.map((f, k) => `SRC-0${k+1} ${f.name} · ${f.stat==='done'?'ingested · transcribed · PII-redacted':'processing'}`).join('\n')}
              {'\n'}<b>All inputs are timestamp-indexed for citation lookup.</b>
            </div>
          )
        } else {
          body = <p style={{fontSize:'13px',color:'var(--ink-soft)'}}>{sc>=90?'Section complete — generated from cited sources.':sc>=60?'Partially complete — some statements have low confidence and are flagged amber.':'Insufficient source coverage — answer the linked follow-up questions to fill this section.'}</p>
        }

        return (
          <div key={i} className={`sec ${isOpen ? 'open' : ''}`}>
            <button className="sec-row" onClick={() => toggleSec(i)} aria-expanded={isOpen}>
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <span className="name">{name}</span>
              {secComments > 0 && <span className="cbubble">💬 {secComments}</span>}
              <div className="meter" style={{maxWidth:'140px'}}><i style={{width:`${sc}%`,background:MeterColor(sc)}} /></div>
              <span className="pct">{sc}%</span>
              <span className="chev">›</span>
            </button>
            <div className="sec-body">{body}</div>
          </div>
        )
      })}
    </div>
  )
}

/* ============ FEASIBILITY TAB ============ */
function TabFeasibility({ p, navigate }) {
  const { toggleFeasAction, updateProject, addProjectActivity } = useProjectStore()
  const { showToast, openModal, busyToast } = useAppStore()
  const viewRole = useAuthStore(s => s.viewRole)
  const isClient = viewRole === 'client'
  const r = p.feasReport
  if (!r) return <div className="empty">No feasibility report yet. Run the feasibility agent first.</div>

  const acts = feasActionsFor(p)
  const resolved = p.feasResolved || {}
  const done = acts.filter(a => resolved[a.id]).length
  const pct = acts.length ? Math.round(done / acts.length * 100) : 100
  const feasLabel = s => s==='green'?'HIGH':s==='amber'?'MED':s==='red'?'LOW':'PENDING'

  function improveFeasibility() {
    const open = acts.filter(a => !resolved[a.id])
    if (open.length) { showToast(`Address all recommendations first — ${open.length} still open`); return }
    busyToast('Re-running feasibility with your changes — re-screening sanctions, geopolitical, regulatory…')
    setTimeout(() => {
      updateProject(p.id, proj => {
        const rp = proj.feasReport
        ;['sanctions','geo','reg','web'].forEach(key => {
          ;(rp[key]||[]).forEach(item => {
            if (item[0]==='block') { item[0]='warn'; item[1]=item[1]+' — mitigation documented' }
            else if (item[0]==='warn') { item[0]='clear'; item[1]=item[1]+' — addressed' }
          })
        })
        const flat = ['sanctions','geo','reg','web'].flatMap(k => rp[k]||[])
        const newScore = flat.some(i=>i[0]==='block')?'red':flat.some(i=>i[0]==='warn')?'amber':'green'
        rp.score = newScore; proj.feas = newScore
        rp.summary = newScore==='green'?'All identified risks addressed. Project is feasible with standard compliance — no outstanding blockers or warnings.':rp.summary
        if (newScore !== 'red' && proj.status === 'blocked') { proj.status='draft'; proj.statusLabel='Unblocked · feasibility remediated'; if(proj.stage<4) proj.stage=4 }
        proj.feasResolved = {}
        proj.activity = [{ ico:'⚖',c:newScore==='green'?'green-soft':'amber-soft',cl:newScore==='green'?'var(--green)':'var(--amber)',txt:`Feasibility re-run after remediation — now ${feasLabel(newScore)}`,time:'Just now'}, ...proj.activity]
        return proj
      })
      showToast(`Feasibility improved · now ${feasLabel(useProjectStore.getState().projById(p.id)?.feas||'green')}`)
    }, 1500)
  }

  return (
    <>
      <div className={`scorebanner ${r.score}`}>
        <div className="big">{feasLabel(r.score)}</div>
        <p>{r.summary}</p>
      </div>

      <div className="feas-grid">
        <div className="feas-card">
          <h4>1 · Sanctions check <span className="cite">OFAC · UN · EU CFSP · UK OFSI</span></h4>
          <ul>{r.sanctions.map(([t, x], i) => <li key={i}><span className="mk">{mk(t)}</span> {x}</li>)}</ul>
        </div>
        <div className="feas-card">
          <h4>2 · Geopolitical risk</h4>
          <ul>{r.geo.map(([t, x], i) => <li key={i}><span className="mk">{mk(t)}</span> {x}</li>)}</ul>
        </div>
        <div className="feas-card">
          <h4>3 · Regulatory mapping <span className="cite">country + industry</span></h4>
          <ul>{r.reg.map(([t, x], i) => <li key={i}><span className="mk">{mk(t)}</span> {x}</li>)}</ul>
        </div>
        <div className="feas-card">
          <h4>4 · Live web search — latest updates</h4>
          <ul>{r.web.map(([t, x], i) => <li key={i}><span className="mk">{mk(t)}</span> {x}</li>)}</ul>
        </div>
      </div>

      {/* Actions panel */}
      <div className="panel" style={{marginTop:'18px'}}>
        <div className="panel-h">
          <h3>Recommended actions to improve feasibility</h3>
          {acts.length > 0 && <span className="count">{acts.length - done} open</span>}
          <span className="spacer" />
          {!isClient && acts.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={improveFeasibility}>↻ Re-run with changes</button>
          )}
        </div>
        {acts.length > 0 ? (
          <div style={{padding:'15px 18px 16px'}}>
            <div className="meterline" style={{marginBottom:'14px'}}>
              <div className="meter"><i style={{width:`${pct}%`,background:pct===100?'var(--green)':'var(--accent)'}} /></div>
              <span className="meter-val">{done}/{acts.length} addressed</span>
            </div>
            {acts.map(a => {
              const isResolved = resolved[a.id]
              return (
                <div key={a.id} className={`feas-act ${isResolved ? 'done' : ''}`}>
                  <div className="fa-mk">{isResolved ? '✓' : a.sev === 'block' ? '⛔' : '⚠'}</div>
                  <div className="fa-body">
                    <div className="fa-top">
                      <span className={`prio ${a.sev==='block'?'high':'med'}`}>{a.sev==='block'?'Blocker':'Warning'}</span>
                      <span className="fa-cat">{a.cat}</span>
                    </div>
                    <p className="fa-find">{a.finding}</p>
                    <p className="fa-rec"><b>Recommended:</b> {a.rec}</p>
                    {!isClient && (
                      <div className="fa-acts">
                        {isResolved
                          ? <button className="btn btn-ghost btn-xs" onClick={() => toggleFeasAction(p.id, a.id, false)}>Mark not done</button>
                          : <>
                              <button className="btn btn-primary btn-xs" onClick={() => toggleFeasAction(p.id, a.id, true)}>Mark addressed</button>
                              {a.sev === 'block' && <button className="btn btn-danger btn-xs" onClick={() => openModal('override')}>Request Admin override</button>}
                            </>
                        }
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty">No outstanding risks — feasibility is clear. No further action required.</div>
        )}
      </div>

      {/* Injected requirements */}
      {p.injected.length > 0 && (
        <div className="panel" style={{marginTop:'18px'}}>
          <div className="panel-h"><h3>Compliance requirements auto-added to PRD §6</h3><span className="count">{p.injected.length}</span></div>
          <div style={{padding:'14px 18px'}}>
            {p.injected.map((inj, i) => (
              <div key={i} className="req injected">
                <span className="rid">{inj.id}</span>
                <p>{inj.text}</p>
                <div className="tags"><span className="cite">[Source: Feasibility Agent | Regulation: {inj.reg}]</span></div>
              </div>
            ))}
            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/projects/${p.id}/prd`)}>Review in PRD → accept / edit / remove</button>
          </div>
        </div>
      )}

      {/* Hard blocker panel */}
      {r.score === 'red' && !isClient && (
        <div className="panel" style={{marginTop:'16px'}}>
          <div style={{padding:'16px 18px',display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:'13.5px'}}><b>Hard blocker:</b> PRD submission for client approval is locked.</span>
            <button className="btn btn-danger btn-sm" onClick={() => openModal('override')}>Request Admin override</button>
          </div>
        </div>
      )}
    </>
  )
}

/* ============ DISCUSSION TAB ============ */
function TabDiscussion({ p }) {
  return (
    <div className="panel" style={{ padding: '20px 18px' }}>
      <DiscussionThread projectId={p.id} />
    </div>
  )
}

/* ============ ACTIVITY TAB ============ */
function TabActivity({ p }) {
  const { data: events, isLoading, isError } = useQuery({
    queryKey: ['activity', p.id],
    queryFn: () => projectsApi.activity(p.id).then(r => r.data),
    staleTime: 30_000,
  })

  return (
    <div className="panel">
      <div style={{padding:'8px 18px 14px'}}>
        {isLoading && <p style={{color:'var(--ink-soft)',textAlign:'center',padding:'24px 0'}}>Loading activity…</p>}
        {isError && <p style={{color:'var(--red)',textAlign:'center',padding:'24px 0'}}>Failed to load activity</p>}
        {events && events.length === 0 && (
          <p style={{color:'var(--ink-soft)',textAlign:'center',padding:'24px 0'}}>No activity yet</p>
        )}
        {events && events.length > 0 && (
          <div className="timeline">
            {events.map((a, i) => (
              <div key={i} className="tl-item">
                <div className="tl-ico" style={{background:`var(--${a.c})`,color:a.cl}}>{a.ico}</div>
                <div className="tl-body">
                  <div className="tl-txt">{renderBoldText(a.txt)}</div>
                  <div className="tl-time">{new Date(a.time).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============ MAIN WORKSPACE ============ */
export default function ProjectWorkspace() {
  const { id, tab: tabParam } = useParams()
  const navigate = useNavigate()
  const { projects, userById } = useProjectStore()
  const { updateProject, addProjectActivity } = useProjectStore()
  const { showToast, openModal, busyToast } = useAppStore()
  const viewRole = useAuthStore(s => s.viewRole)
  const user = useAuthStore(s => s.user)
  const isClient = viewRole === 'client'

  const [submitting, setSubmitting] = useState(false)
  const loading = useProjectStore(s => s.loading)
  const p = projects.find(x => String(x.id) === String(id))
  const tab = tabParam || 'overview'

  if (loading && !p) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink-soft)' }}>
      <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
      <p>Loading project…</p>
    </div>
  )
  if (!p) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>404</div>
        <h3 style={{ marginBottom: '8px' }}>Project not found</h3>
        <p style={{ color: 'var(--ink-soft)', marginBottom: '20px' }}>This project may have been deleted or you may not have access.</p>
        <button className="btn btn-primary" onClick={() => navigate('/projects')}>Back to Projects</button>
      </div>
    )
  }

  const openCount = (p.clars || []).filter(c => c.state === 'open').length
  const cCount = 0  // real comment count fetched inside DiscussionThread via API

  const TABS = isClient
    ? [['prd','Requirements'],['discussion','Discussion',cCount],['feasibility','Feasibility']]
    : [['overview','Overview'],['inputs','Inputs & processing',p.inputs.filter(f=>f.stat!=='done').length||0],['prd','PRD',openCount],['feasibility','Feasibility'],['discussion','Discussion',cCount],['activity','Activity']]

  function goTab(t) { navigate(`/projects/${p.id}/${t}`) }

  async function submitApproval() {
    if (p.feas === 'red' && p.status === 'blocked') { showToast('Red blocker unresolved — admin override required before submission'); return }
    setSubmitting(true)
    try {
      await projectsApi.updateStage(p.id, 'client_review')
      updateProject(p.id, proj => ({ ...proj, status: 'review', statusLabel: 'In client review', stage: 5 }))
      addProjectActivity(p.id, { ico: '📄', c: 'accent-soft', cl: 'var(--accent)', txt: 'Submitted PRD for client approval', time: 'Just now' })
      showToast('PRD submitted for client approval')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to submit for approval', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function runFeasibility() {
    navigate(`/projects/${p.id}/feasibility`)
  }

  async function clientApprove() {
    setSubmitting(true)
    try {
      await prdApi.approve(p.id, { comment: 'Approved via client portal' })
      updateProject(p.id, proj => ({ ...proj, status: 'approved', statusLabel: 'Approved · v1.0 locked', stage: 6, completeness: Math.max(proj.completeness, 96) }))
      addProjectActivity(p.id, { ico: '✅', c: 'green-soft', cl: 'var(--green)', txt: `<b>${user?.name || 'Client'}</b> approved the PRD — locked`, time: 'Just now' })
      showToast('PRD approved & locked.')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Approval failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function clientRequestChanges() {
    updateProject(p.id, proj => ({ ...proj, statusLabel: 'Changes requested by client' }))
    addProjectActivity(p.id, { ico: '✍', c: 'amber-soft', cl: 'var(--amber)', txt: `<b>${user?.name || 'Client'}</b> requested changes`, time: 'Just now' })
    showToast('Change request sent to the Xccelera team')
  }

  const teamUsers = p.team.map(id => userById(id)).filter(Boolean)

  return (
    <>
      {isClient && (
        <div className="banner client">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span>You're reviewing as <b>{user?.name || 'Client'}</b>{p?.client ? ` (${p.client})` : ''}. You can read the PRD, leave comments, answer open questions, and approve.</span>
          <span className="bspace" />
        </div>
      )}

      {!isClient && <button className="back" onClick={() => navigate('/projects')}>← Back to projects</button>}

      <div className="prd-head">
        <div className="top">
          <div>
            <h2>{p.name}</h2>
            <div className="meta">{p.client} · {p.country} · {p.industry} · {p.deploy} · Output: {p.langs}</div>
            <div style={{marginTop:'10px',display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
              <FeasBadge score={p.feas} />
              <span className={`badge ${p.status==='blocked'?'red':(STAGE_BADGE[p.stage]??'gray')}`}><span className="dot" />{STAGES[p.stage]}</span>
              {openCount > 0 && <span className="badge amber"><span className="dot" />{openCount} open questions</span>}
              <AvatarStack users={teamUsers} />
            </div>
          </div>
          <div className="actions">
            {isClient ? (
              <>
                <button className="btn btn-ghost" onClick={() => goTab('discussion')}>Leave a comment</button>
                {p.status === 'approved'
                  ? <button className="btn btn-primary" disabled>Approved · locked</button>
                  : <>
                      <button className="btn btn-ghost" disabled={submitting} onClick={clientRequestChanges}>Request changes</button>
                      <button className="btn btn-primary" disabled={submitting} onClick={clientApprove}>{submitting ? 'Approving…' : 'Approve PRD'}</button>
                    </>
                }
              </>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={runFeasibility}>⚖ Run feasibility</button>
                <ExportButton projectId={p.id} projectName={p.name} />
                <button className="btn btn-primary" disabled={submitting || p.status==='blocked'} title={p.status==='blocked'?'Hard blocker — resolve or request Admin override':undefined} onClick={submitApproval}>
                  {submitting ? 'Submitting…' : p.status === 'approved' ? 'Approved · locked' : 'Submit for approval'}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="prd-overall">
          <span className="lbl">Overall completeness</span>
          <div className="meter"><i style={{width:`${p.completeness}%`,background:MeterColor(p.completeness)}} /></div>
          <span className="pct">{p.completeness}% · {p.completeness>=90?'Ready':p.completeness>=60?'Review required':'Needs input'}</span>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([tid, label, count]) => (
          <button key={tid} className={`tab ${tab===tid?'active':''}`} onClick={() => goTab(tid)}>
            {label}
            {count > 0 && <span className="tc">{count}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview'    && <TabOverview p={p} navigate={navigate} />}
      {tab === 'inputs'      && <TabInputs p={p} />}
      {tab === 'prd'         && <PRDSection projectId={p.id} />}
      {tab === 'feasibility' && <FeasibilityPanel projectId={p.id} project={p} />}
      {tab === 'discussion'  && <TabDiscussion p={p} />}
      {tab === 'activity'    && <TabActivity p={p} />}
    </>
  )
}
