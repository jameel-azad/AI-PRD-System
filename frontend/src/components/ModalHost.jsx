import { useState, useRef, useEffect } from 'react'
import useAppStore from '../store/appStore'
import useProjectStore from '../store/projectStore'
import { COUNTRIES, INDUSTRIES, LANGS } from '../data/mockData'
import { projects as projectsApi, files as filesApi } from '../services/api'

export default function ModalHost() {
  const { modal, closeModal, showToast } = useAppStore()
  const { projects, roles, addProject, addUser, addRole } = useProjectStore()

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') closeModal() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeModal])

  if (!modal) return null

  const overlayClick = e => { if (e.target === e.currentTarget) closeModal() }

  return (
    <div className="overlay" onClick={overlayClick}>
      {modal.type === 'newproj' && (
        <NewProjectModal closeModal={closeModal} showToast={showToast} addProject={addProject} />
      )}
      {modal.type === 'invite' && (
        <InviteModal closeModal={closeModal} showToast={showToast} roles={roles} addUser={addUser} usersCount={useProjectStore.getState().users.length} />
      )}
      {modal.type === 'newrole' && (
        <NewRoleModal closeModal={closeModal} showToast={showToast} roles={roles} addRole={addRole} />
      )}
      {modal.type === 'upload' && (
        <UploadModal closeModal={closeModal} showToast={showToast} projects={projects} param={modal.param} />
      )}
      {modal.type === 'override' && (
        <OverrideModal closeModal={closeModal} showToast={showToast} />
      )}
    </div>
  )
}

function NewProjectModal({ closeModal, showToast, addProject }) {
  const [deploy, setDeploy] = useState('SaaS')
  const [creating, setCreating] = useState(false)
  const nameRef = useRef()
  const clientRef = useRef()
  const approverRef = useRef()
  const countryRef = useRef()
  const industryRef = useRef()
  const lang1Ref = useRef()
  const lang2Ref = useRef()
  const deadlineRef = useRef()

  async function create() {
    const name = (nameRef.current?.value || '').trim()
    const client = (clientRef.current?.value || '').trim()
    if (!name || !client) { showToast('Project name and client are required'); return }
    const l1 = lang1Ref.current?.value || 'English'
    const l2 = lang2Ref.current?.value || ''
    const langs = l2 ? `${l1.slice(0,2).toUpperCase()} + ${l2.slice(0,2).toUpperCase()}` : l1.slice(0,2).toUpperCase()
    setCreating(true)
    try {
      const { data } = await projectsApi.create({
        name, client_org: client,
        country: countryRef.current?.value || null,
        industry: industryRef.current?.value || null,
        deployment_type: deploy || null,
        approver_email: approverRef.current?.value || null,
      })
      addProject({
        ...data,
        client, client_org: client,
        country: countryRef.current?.value || '', industry: industryRef.current?.value || '',
        feas: 'green', completeness: 0, status: data.stage || 'intake', statusLabel: 'Intake · awaiting first inputs',
        langs, deadline: deadlineRef.current?.value || '—', updated: 'Just now', deploy,
        approver: approverRef.current?.value || '—', stage: 0, team: [], sources: [], tag: 'New project',
        sections: new Array(14).fill(0), inputs: [], flowState: [0,0,0,0,0,0,0,0],
        clars: [], comments: [], feasReport: null, reqs: [], injected: [], feasResolved: {},
        activity: [{ ico: '✨', c: 'accent-soft', cl: 'var(--accent)', txt: `<b>You</b> created the project`, time: 'Just now' }],
      })
      closeModal()
      showToast(`Project "${name}" created`)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to create project', 'error')
      setCreating(false)
    }
  }

  return (
    <div className="modal">
      <div className="modal-h">
        <div><h3>New project</h3></div>
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button>
      </div>
      <div className="modal-b">
        <div className="field"><label>Project name</label><input ref={nameRef} placeholder="e.g. Patient Intake & Telehealth Portal" /></div>
        <div className="grid2">
          <div className="field"><label>Client organisation</label><input ref={clientRef} placeholder="e.g. MedAxis Health" /></div>
          <div className="field"><label>Client approver email</label><input ref={approverRef} type="email" placeholder="approver@client.com" /><div className="hint">Single approver — receives review & approval requests.</div></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Client country / region</label>
            <select ref={countryRef}>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="field"><label>Industry</label>
            <select ref={industryRef}>{INDUSTRIES.map(c => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
        <div className="grid2">
          <div className="field"><label>PRD language</label><select ref={lang1Ref}>{LANGS.map(l => <option key={l}>{l}</option>)}</select></div>
          <div className="field"><label>Second language (optional)</label><select ref={lang2Ref}><option value="">None</option>{LANGS.slice(1).map(l => <option key={l}>{l}</option>)}</select></div>
        </div>
        <div className="field"><label>Deployment model</label>
          <div className="deploy">
            {['SaaS','Private GCP','Internal'].map(d => (
              <label key={d} className={deploy === d ? 'selected' : ''} onClick={() => setDeploy(d)}>
                <input type="radio" name="ndeploy" value={d} readOnly checked={deploy === d} style={{position:'absolute',opacity:0}} />
                <b>{d}</b><small>{d === 'SaaS' ? 'Shared GCP, Xccelera-managed' : d === 'Private GCP' ? 'Dedicated project, full isolation' : 'Xccelera team instance'}</small>
              </label>
            ))}
          </div>
        </div>
        <div className="grid2">
          <div className="field"><label>Review deadline (optional)</label><input ref={deadlineRef} type="date" /></div>
          <div className="field"><label>Reminder emails</label><select><option>After 2 and 5 days</option><option>Every 2 days</option><option>Weekly</option><option>Off</option></select></div>
        </div>
      </div>
      <div className="modal-f">
        <button className="btn btn-ghost" onClick={closeModal} disabled={creating}>Cancel</button>
        <button className="btn btn-primary" onClick={create} disabled={creating}>{creating ? 'Creating…' : 'Create project'}</button>
      </div>
    </div>
  )
}

function InviteModal({ closeModal, showToast, roles, addUser, usersCount }) {
  const nameRef = useRef()
  const emailRef = useRef()
  const roleRef = useRef()

  function send() {
    const name = (nameRef.current?.value || '').trim()
    const email = (emailRef.current?.value || '').trim()
    const role = roleRef.current?.value
    if (!name || !email) { showToast('Name and email are required'); return }
    const r = roles.find(x => x.id === role) || { label: role }
    const colors = ['c-teal','c-blue','c-violet','c-amber','c-green','c-slate']
    addUser({ id: 'u' + (Date.now() % 100000), name, email, role, roleLabel: r.label, color: colors[usersCount % colors.length], status: 'Invited', last: '—' })
    closeModal()
    showToast(`Invite emailed to ${email} as ${r.label}`)
  }

  return (
    <div className="modal">
      <div className="modal-h"><div><h3>Invite team member</h3></div><button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button></div>
      <div className="modal-b">
        <div className="field"><label>Full name</label><input ref={nameRef} placeholder="e.g. Jordan Lee" /></div>
        <div className="field"><label>Work email</label><input ref={emailRef} type="email" placeholder="jordan@xccelera.com" /></div>
        <div className="field"><label>Role</label>
          <select ref={roleRef}>{roles.filter(r => !r.external).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
          <div className="hint">RBAC controls what each member can see and do.</div>
        </div>
      </div>
      <div className="modal-f"><button className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" onClick={send}>Send invite</button></div>
    </div>
  )
}

function NewRoleModal({ closeModal, showToast, roles, addRole }) {
  const nameRef = useRef()
  const descRef = useRef()
  const baseRef = useRef()
  const badgeRef = useRef()
  const extRef = useRef()

  function create() {
    const name = (nameRef.current?.value || '').trim()
    if (!name) { showToast('Give the role a name'); return }
    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || ('role' + (Date.now() % 10000))
    if (roles.some(r => r.id === id)) id = id + '-' + (Date.now() % 1000)
    addRole({ id, label: name, desc: descRef.current?.value || `Custom role`, badge: badgeRef.current?.value || 'gray', builtin: false, external: extRef.current?.checked || false })
    closeModal()
    showToast(`Role "${name}" created`)
  }

  return (
    <div className="modal">
      <div className="modal-h"><div><h3>Create a new role</h3></div><button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button></div>
      <div className="modal-b">
        <div className="field"><label>Role name</label><input ref={nameRef} placeholder="e.g. Reviewer Lead" /></div>
        <div className="field"><label>What can this role do?</label><textarea ref={descRef} rows="2" placeholder="e.g. Review & comment on PRDs · run gap analysis · cannot approve" /></div>
        <div className="grid2">
          <div className="field"><label>Access level (inherits from)</label>
            <select ref={baseRef}>{roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
            <div className="hint">New role starts with this role's permissions.</div>
          </div>
          <div className="field"><label>Badge colour</label>
            <select ref={badgeRef}>
              <option value="violet">Violet</option><option value="blue">Blue</option>
              <option value="green">Green</option><option value="amber">Amber</option>
              <option value="gray">Grey</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label style={{display:'flex',gap:'7px',alignItems:'center',fontWeight:500,fontSize:'13px'}}>
            <input ref={extRef} type="checkbox" style={{width:'auto'}} /> External role (client-side — not assignable to internal staff)
          </label>
        </div>
      </div>
      <div className="modal-f"><button className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" onClick={create}>Create role</button></div>
    </div>
  )
}

function UploadModal({ closeModal, showToast, projects, param }) {
  const [kind, setKind] = useState(param?.kind || 'doc')
  const [fileName, setFileName] = useState('')
  const [noteText, setNoteText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const projRef = useRef()
  const fileRef = useRef()
  const { updateProject, addProjectActivity } = useProjectStore()

  async function doUpload() {
    const pid = projRef.current?.value
    const p = projects.find(x => String(x.id) === String(pid))
    if (!p) return

    if (kind === 'text') {
      if (!noteText.trim()) { showToast('Type some notes first'); return }
      // Upload pasted text as a real .txt file so the pipeline can process it
      const nm = `pasted_notes_${Date.now() % 100000}.txt`
      const blob = new Blob([noteText], { type: 'text/plain' })
      const textFile = new File([blob], nm, { type: 'text/plain' })
      setUploading(true)
      setUploadPct(0)
      try {
        const { data: uploadRes } = await filesApi.upload(pid, textFile, pct => setUploadPct(pct))
        updateProject(pid, proj => ({
          ...proj,
          inputs: [...(proj.inputs || []), {
            fileId: uploadRes.id, name: uploadRes.filename || nm, kind: 'text',
            size: (noteText.length / 1024).toFixed(1) + ' KB', stat: 'queue', prog: 0, meta: uploadRes.status || 'queued',
          }],
          stage: Math.max(proj.stage, 1),
        }))
        addProjectActivity(pid, { ico: '📥', c: 'violet-soft', cl: 'var(--violet)', txt: `<b>You</b> added ${nm}`, time: 'Just now' })
        closeModal()
        showToast('Notes uploaded — pipeline started')
      } catch (err) {
        showToast(err.response?.data?.detail || 'Upload failed', 'error')
        setUploading(false)
        setUploadPct(0)
      }
      return
    }

    if (kind === 'record') {
      showToast('Live recording is not yet available — use the file upload option instead', 'error')
      return
    }

    const f = fileRef.current?.files?.[0]
    if (!f) { showToast('Choose a file to upload'); return }
    const ext = f.name.split('.').pop()?.toLowerCase() || ''
    const ALLOWED_EXTS = new Set(['mp3','wav','m4a','ogg','mp4','mov','avi','mkv','webm','pdf','docx','txt','md'])
    if (!ALLOWED_EXTS.has(ext)) { showToast(`Unsupported file type: .${ext}. Supported: audio, video, PDF, DOCX, TXT, MD`, 'error'); return }
    const SIZE_LIMITS_MB = { mp3:500, wav:500, m4a:500, ogg:500, mp4:1000, mov:1000, avi:1000, mkv:1000, webm:1000, pdf:50, docx:50, txt:50, md:50 }
    const limitMB = SIZE_LIMITS_MB[ext] ?? 500
    if (f.size > limitMB * 1_000_000) { showToast(`File too large — max ${limitMB} MB for .${ext} files`, 'error'); return }
    const nm = f.name
    const sz = (f.size / 1048576).toFixed(1) + ' MB'

    setUploading(true)
    setUploadPct(0)
    try {
      const { data: uploadRes } = await filesApi.upload(pid, f, pct => setUploadPct(pct))
      updateProject(pid, proj => {
        const newFlowState = proj.flowState.every(s => s === 0) ? [2, ...proj.flowState.slice(1)] : proj.flowState
        const newFile = {
          fileId: uploadRes.id,
          name: uploadRes.filename || nm,
          kind,
          size: sz,
          stat: 'queue',
          prog: 0,
          meta: uploadRes.status || 'queued',
        }
        return { ...proj, inputs: [...(proj.inputs || []), newFile], stage: Math.max(proj.stage, 1), flowState: newFlowState }
      })
      addProjectActivity(pid, { ico: '📥', c: 'violet-soft', cl: 'var(--violet)', txt: `<b>You</b> added ${nm}`, time: 'Just now' })
      closeModal()
      showToast('Input added — processing started')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Upload failed', 'error')
      setUploading(false)
      setUploadPct(0)
    }
  }

  return (
    <div className="modal">
      <div className="modal-h"><div><h3>Add input source</h3></div><button className="btn btn-ghost btn-sm" onClick={closeModal} disabled={uploading}>✕</button></div>
      <div className="modal-b">
        <div className="field"><label>Project</label>
          <select ref={projRef} defaultValue={param?.projId || projects[0]?.id} disabled={uploading}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Source type</label>
          <select value={kind} onChange={e => setKind(e.target.value)} disabled={uploading}>
            <option value="video">🎥 Video — MP4/MOV/WebM · ≤1 GB</option>
            <option value="audio">🎙 Audio — MP3/WAV/M4A · ≤500 MB</option>
            <option value="doc">📄 Document — PDF/Word/TXT · ≤50 MB</option>
            <option value="text">📝 Direct text — paste notes</option>
          </select>
        </div>
        {kind === 'text' ? (
          <div className="field"><label>Notes</label><textarea rows="3" placeholder="Type or paste requirement notes…" value={noteText} onChange={e => setNoteText(e.target.value)} /></div>
        ) : (
          <div className="dropzone" onClick={() => !uploading && fileRef.current?.click()} style={uploading ? {cursor:'default',opacity:.7} : {}}>
            <div className="dz-ico">⬆</div>
            <div>{fileName ? fileName : <span>Drop a file here or <u>browse</u></span>}</div>
            <div style={{fontSize:'12px',color:'var(--ink-soft)',marginTop:'6px'}}>Files are encrypted at rest (AES-256). Raw recordings auto-deleted after processing.</div>
            <input type="file" ref={fileRef} style={{display:'none'}} disabled={uploading} accept=".mp3,.wav,.m4a,.ogg,.mp4,.mov,.avi,.mkv,.webm,.pdf,.docx,.txt,.md" onChange={e => setFileName(e.target.files?.[0]?.name || '')} />
          </div>
        )}
        {uploading && (
          <div style={{marginTop:'10px'}}>
            <div style={{height:'4px',background:'var(--line)',borderRadius:'2px',overflow:'hidden'}}>
              <div style={{height:'100%',background:'var(--accent)',borderRadius:'2px',width:`${uploadPct}%`,transition:'width 0.15s ease'}} />
            </div>
            <p style={{marginTop:'5px',fontSize:'12px',color:'var(--ink-soft)',textAlign:'center'}}>
              {uploadPct < 100 ? `Uploading — ${uploadPct}%` : 'Processing…'}
            </p>
          </div>
        )}
      </div>
      <div className="modal-f">
        <button className="btn btn-ghost" onClick={closeModal} disabled={uploading}>Cancel</button>
        <button className="btn btn-primary" onClick={doUpload} disabled={uploading}>
          {uploading ? `${uploadPct < 100 ? `${uploadPct}% uploaded` : 'Processing…'}` : 'Add & process'}
        </button>
      </div>
    </div>
  )
}

function OverrideModal({ closeModal, showToast }) {
  const textRef = useRef()
  function send() {
    closeModal()
    showToast('Override request sent to Admin for review')
  }
  return (
    <div className="modal">
      <div className="modal-h"><div><h3>Request admin override</h3></div><button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button></div>
      <div className="modal-b">
        <div style={{background:'var(--red-soft)',border:'1px solid var(--red)',color:'#f87171',borderRadius:'10px',padding:'12px 14px',fontSize:'13px',lineHeight:1.5,marginBottom:'14px'}}>
          <b>Hard blocker:</b> a sanctions / banned-tech hit prevents submitting this PRD for client approval. An Admin must review and explicitly override before the project can proceed.
        </div>
        <div className="field"><label>Justification for override</label><textarea ref={textRef} rows="3" placeholder="Explain why this project should proceed despite the blocker…" /></div>
      </div>
      <div className="modal-f"><button className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-danger" onClick={send}>Send to Admin</button></div>
    </div>
  )
}
