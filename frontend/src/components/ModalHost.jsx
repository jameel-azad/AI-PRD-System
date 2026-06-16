import { useState, useRef, useEffect } from 'react'
import useAppStore from '../store/appStore'
import useProjectStore from '../store/projectStore'
import { COUNTRIES, INDUSTRIES, LANGS } from '../data/mockData'

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
  const nameRef = useRef()
  const clientRef = useRef()
  const approverRef = useRef()
  const countryRef = useRef()
  const industryRef = useRef()
  const lang1Ref = useRef()
  const lang2Ref = useRef()
  const deadlineRef = useRef()

  function create() {
    const name = (nameRef.current?.value || '').trim()
    const client = (clientRef.current?.value || '').trim()
    if (!name || !client) { showToast('Project name and client are required'); return }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 18) + '-' + Math.floor(Math.random() * 900 + 100)
    const l1 = lang1Ref.current?.value || 'English'
    const l2 = lang2Ref.current?.value || ''
    addProject({
      id, name, client, country: countryRef.current?.value || '', industry: industryRef.current?.value || '',
      feas: 'green', completeness: 0, status: 'intake', statusLabel: 'Intake · awaiting first inputs',
      langs: l2 ? `${l1.slice(0,2).toUpperCase()} + ${l2.slice(0,2).toUpperCase()}` : l1.slice(0,2).toUpperCase(),
      deadline: deadlineRef.current?.value || '—', updated: 'Just now', deploy,
      approver: approverRef.current?.value || '—', stage: 0, team: ['priya'], sources: [], tag: 'New project',
      sections: new Array(14).fill(0), inputs: [], flowState: [0,0,0,0,0,0,0,0],
      clars: [], comments: [], feasReport: null, reqs: [], injected: [], feasResolved: {},
      activity: [{ ico: '✨', c: 'accent-soft', cl: 'var(--accent)', txt: `<b>Priya K.</b> created the project`, time: 'Just now' }],
    })
    closeModal()
    showToast(`Project "${name}" created`)
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
        <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
        <button className="btn btn-primary" onClick={create}>Create project</button>
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
  const projRef = useRef()
  const fileRef = useRef()
  const { updateProject, addProjectActivity } = useProjectStore()

  function doUpload() {
    const pid = projRef.current?.value
    const p = projects.find(x => x.id === pid)
    if (!p) return
    let nm, sz, meta
    if (kind === 'text') {
      if (!noteText.trim()) { showToast('Type some notes first'); return }
      nm = 'pasted_notes_' + (Date.now() % 10000) + '.txt'; sz = (noteText.length / 1024).toFixed(1) + ' KB'; meta = 'queued for extraction'
    } else if (kind === 'record') {
      nm = 'live_recording_' + (Date.now() % 10000) + '.webm'; sz = '—'; meta = 'recording queued'
    } else {
      const f = fileRef.current?.files?.[0]
      if (!f) { showToast('Choose a file to upload'); return }
      nm = f.name; sz = (f.size / 1048576).toFixed(1) + ' MB'; meta = 'uploading…'
    }
    updateProject(pid, proj => {
      const newInputs = [...proj.inputs, { name: nm, kind: kind === 'record' ? 'video' : kind, size: sz, stat: 'proc', prog: 0, meta }]
      const newFlowState = proj.flowState.every(s => s === 0) ? [2, ...proj.flowState.slice(1)] : proj.flowState
      return { ...proj, inputs: newInputs, stage: Math.max(proj.stage, 1), flowState: newFlowState }
    })
    addProjectActivity(pid, { ico: '📥', c: 'violet-soft', cl: 'var(--violet)', txt: `<b>You</b> added ${nm}`, time: 'Just now' })
    closeModal()
    showToast('Input added — processing started')
  }

  return (
    <div className="modal">
      <div className="modal-h"><div><h3>Add input source</h3></div><button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button></div>
      <div className="modal-b">
        <div className="field"><label>Project</label>
          <select ref={projRef} defaultValue={param?.projId || projects[0]?.id}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Source type</label>
          <select value={kind} onChange={e => setKind(e.target.value)}>
            <option value="video">🎥 Video — MP4/MOV/WebM · ≤1 GB</option>
            <option value="audio">🎙 Audio — MP3/WAV/M4A · ≤500 MB</option>
            <option value="doc">📄 Document — PDF/Word/TXT · ≤50 MB</option>
            <option value="chat">💬 Chat export — Slack/WhatsApp/Teams · ≤10 MB</option>
            <option value="email">📧 Email — forward-to-ingest / OAuth</option>
            <option value="text">📝 Direct text — paste notes</option>
            <option value="record">🔴 Live recording — record this call</option>
          </select>
        </div>
        {kind === 'text' ? (
          <div className="field"><label>Notes</label><textarea rows="3" placeholder="Type or paste requirement notes…" value={noteText} onChange={e => setNoteText(e.target.value)} /></div>
        ) : (
          <div className="dropzone" onClick={() => fileRef.current?.click()}>
            <div className="dz-ico">⬆</div>
            <div>{fileName ? fileName : <span>Drop a file here or <u>browse</u></span>}</div>
            <div style={{fontSize:'12px',color:'var(--ink-soft)',marginTop:'6px'}}>Files are encrypted at rest (AES-256). Raw recordings auto-deleted after processing.</div>
            <input type="file" ref={fileRef} style={{display:'none'}} onChange={e => setFileName(e.target.files?.[0]?.name || '')} />
          </div>
        )}
      </div>
      <div className="modal-f"><button className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" onClick={doUpload}>Add &amp; process</button></div>
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
