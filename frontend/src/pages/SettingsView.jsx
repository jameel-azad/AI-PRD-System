import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import useAppStore from '../store/appStore'
import { auth } from '../services/api'

const SETTINGS_KEY = 'xccelera_settings'

function fmtTs(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function SettingsView() {
  const { showToast } = useAppStore()

  const { data: auditEvents = [], isLoading: auditLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => auth.auditLog().then(r => r.data),
  })
  const [switches, setSwitches] = useState(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY)
      if (saved) return { ...{ pii: true, recordings: true, gdpr: true, anon: false, clientActions: true, gapAnalysis: true, blockers: true, deadlines: true }, ...JSON.parse(saved) }
    } catch {}
    return { pii: true, recordings: true, gdpr: true, anon: false, clientActions: true, gapAnalysis: true, blockers: true, deadlines: true }
  })

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(switches))
  }, [switches])

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
        {auditLoading ? (
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>Loading…</p>
        ) : auditEvents.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>No audit events yet.</p>
        ) : (
          <div className="audit">
            {auditEvents.map((e, i) => (
              <span key={i}>
                {fmtTs(e.ts)} <b>{e.actor}</b> {e.action}{e.detail ? ` ${e.detail}` : ''}{i < auditEvents.length - 1 ? <br /> : null}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
