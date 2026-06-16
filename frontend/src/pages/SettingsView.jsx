import { useState } from 'react'
import useAppStore from '../store/appStore'

export default function SettingsView() {
  const { showToast } = useAppStore()
  const [switches, setSwitches] = useState({
    pii: true, recordings: true, gdpr: true, anon: false,
    clientActions: true, gapAnalysis: true, blockers: true, deadlines: true,
  })

  function flip(key, label) {
    setSwitches(s => {
      const next = { ...s, [key]: !s[key] }
      showToast(`${label} ${next[key] ? 'enabled' : 'disabled'}`)
      return next
    })
  }

  return (
    <div className="set-grid">
      <div className="set-card">
        <h4>Data &amp; privacy</h4>
        {[
          ['pii', 'Automatic PII redaction', 'Redact PII from transcripts before storage'],
          ['recordings', 'Delete raw recordings after processing', 'Default retention policy — configurable per project'],
          ['gdpr', 'GDPR deletion requests', 'Allow verified data-deletion on request'],
          ['anon', 'Anonymous share links', 'Disabled by policy — client portal requires login'],
        ].map(([key, label, sub]) => (
          <div key={key} className="switchrow">
            <span>{label}<small>{sub}</small></span>
            <button className={`switch ${switches[key] ? 'on' : ''}`} role="switch" aria-checked={switches[key]}
              onClick={() => key === 'anon' ? showToast('Blocked by workspace policy — no anonymous links') : flip(key, label)} />
          </div>
        ))}
      </div>

      <div className="set-card">
        <h4>Notifications</h4>
        {[
          ['clientActions', 'Client actions', 'Comment, answer, approve / request changes'],
          ['gapAnalysis', 'Gap analysis complete', 'When new follow-up questions are generated'],
          ['blockers', 'Feasibility blockers', 'Sanctions hits and hard blockers'],
          ['deadlines', 'Deadline reminders', 'Email + in-app when client hasn\'t acted'],
        ].map(([key, label, sub]) => (
          <div key={key} className="switchrow">
            <span>{label}<small>{sub}</small></span>
            <button className={`switch ${switches[key] ? 'on' : ''}`} role="switch" aria-checked={switches[key]} onClick={() => flip(key, label)} />
          </div>
        ))}
      </div>

      <div className="set-card">
        <h4>Approval &amp; language defaults</h4>
        <div className="field">
          <label>Reminder schedule</label>
          <select onChange={() => showToast('Default reminder schedule saved')}>
            <option>After 2 and 5 days</option><option>Every 2 days</option><option>Weekly</option><option>Off</option>
          </select>
        </div>
        <div className="field">
          <label>Default PRD language</label>
          <select onChange={() => showToast('Default PRD language saved')}>
            <option>English</option><option>French</option><option>German</option><option>Arabic</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Default deployment model</label>
          <select onChange={() => showToast('Default deployment saved')}>
            <option>SaaS (multi-tenant)</option><option>Private GCP (dedicated)</option><option>Internal</option>
          </select>
        </div>
      </div>

      <div className="set-card">
        <h4>Audit log (latest)</h4>
        <div className="audit">
          12 Jun 09:42 <b>priya.k</b> VIEW prd/medaxis v0.9<br />
          12 Jun 09:33 <b>l.weber</b> COMMENT prd/medaxis §6<br />
          12 Jun 09:18 <b>priya.k</b> LOGIN sso/google ok<br />
          11 Jun 18:20 <b>system</b> GAP_ANALYSIS hr-onboarding → 4 questions<br />
          11 Jun 11:05 <b>priya.k</b> SUBMIT_APPROVAL medaxis → l.weber@medaxis.de<br />
          10 Jun 17:31 <b>feas-agent</b> SANCTIONS_HIT volkov OFAC_SDN 0.94<br />
          09 Jun 14:05 <b>r.haddad</b> APPROVE nimbus v1.0 (locked)
        </div>
      </div>
    </div>
  )
}
