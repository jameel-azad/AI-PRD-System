import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { feasibility as feasApi } from '../services/api'
import useAuthStore from '../store/authStore'
import useProjectStore from '../store/projectStore'

// ── helpers ─────────────────────────────────────────────────────────────────

function parseSanctionLines(detail = '') {
  return detail.split(' | ').filter(Boolean).map(line => {
    const isMatch = /subject to|listed on|ENTITY WARNING|sectoral sanctions/i.test(line)
    return { text: line, clear: !isMatch, warn: isMatch }
  })
}

function deriveActions(result) {
  if (!result) return []
  const actions = []
  const sov = result.geopolitical?.data_sovereignty_notes || ''
  if (sov && !/^no specific/i.test(sov) && !/none identified/i.test(sov)) {
    actions.push({
      id: 'geo_sovereignty',
      category: 'GEOPOLITICAL',
      issue: sov.split('.')[0] + '.',
      recommendation: 'Pin the data-residency region and add a data-residency non-functional requirement to PRD §6.',
      hasPrdAction: true,
    })
  }
  ;(result.regulatory?.required_compliances || []).forEach((c, i) => {
    actions.push({
      id: `reg_${i}`,
      category: 'REGULATORY',
      issue: `${c.framework} — ${c.reason || 'applicable to this project'}`,
      recommendation: 'Inject the applicable compliance requirement into PRD §6 and assign an owner to close it.',
      hasPrdAction: true,
    })
  })
  ;(result.hard_blockers || []).forEach((b, i) => {
    actions.push({
      id: `blocker_${i}`,
      category: (b.type || 'SANCTIONS').toUpperCase(),
      issue: b.detail,
      recommendation: b.override_allowed_by || 'Admin override required before project can proceed.',
      hasPrdAction: false,
    })
  })
  return actions
}

// ── status config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  green: { shortLabel: 'GREEN', color: 'var(--green)',   bg: 'color-mix(in srgb, var(--green) 12%, var(--surface))',   border: 'color-mix(in srgb, var(--green) 30%, transparent)' },
  amber: { shortLabel: 'MED',   color: 'var(--amber)',   bg: 'color-mix(in srgb, var(--amber) 12%, var(--surface))',   border: 'color-mix(in srgb, var(--amber) 30%, transparent)' },
  red:   { shortLabel: 'RED',   color: 'var(--red)',     bg: 'color-mix(in srgb, var(--red) 12%, var(--surface))',     border: 'color-mix(in srgb, var(--red) 30%, transparent)'   },
}

// ── sub-components ───────────────────────────────────────────────────────────

function Tag({ label, cls = 'gray' }) {
  return (
    <span className={`badge ${cls}`} style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
      {label}
    </span>
  )
}

function CheckLine({ icon, text }) {
  const ico = icon === 'ok'   ? { ch: '✓', color: 'var(--green)' }
            : icon === 'warn' ? { ch: '⚠', color: 'var(--amber)' }
            : icon === 'red'  ? { ch: '✕', color: 'var(--red)'   }
            :                   { ch: '↳', color: 'var(--ink-soft)' }
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '4px 0', fontSize: '13px', lineHeight: 1.45 }}>
      <span style={{ color: ico.color, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{ico.ch}</span>
      <span style={{ color: 'var(--ink)' }}>{text}</span>
    </div>
  )
}

function CheckCard({ num, title, tags = [], children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{num} · {title}</span>
        {tags.map(t => <Tag key={t.label} label={t.label} cls={t.cls} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {children}
      </div>
    </div>
  )
}

function RunForm({ form, setForm, onRun, isPending }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
      <h3 style={{ margin: '0 0 18px', fontSize: '15px', fontWeight: 600 }}>Run Feasibility Assessment</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        {[['country', 'Country', 'e.g. Germany'], ['industry', 'Industry', 'e.g. Healthcare']].map(([key, label, ph]) => (
          <div key={key} className="field">
            <label>{label}</label>
            <input
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={ph}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--paper)', color: 'var(--ink)', fontSize: '13.5px' }}
            />
          </div>
        ))}
      </div>
      <div className="field" style={{ marginBottom: '18px' }}>
        <label>Project Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Brief description of what you're building…"
          style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--paper)', color: 'var(--ink)', fontSize: '13.5px', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>
      <button
        className="btn btn-primary"
        onClick={onRun}
        disabled={isPending || !form.country.trim()}
      >
        {isPending ? 'Running assessment…' : 'Run Assessment'}
      </button>
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────

export default function FeasibilityPanel({ projectId, project }) {
  const qc       = useQueryClient()
  const user     = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const toggleFeasAction = useProjectStore(s => s.toggleFeasAction)

  const [form, setForm] = useState({
    client_name: project?.client_org || '',
    country: '', industry: '', description: '',
  })
  const [rerunMode, setRerunMode] = useState(false)

  const { data: report, isLoading } = useQuery({
    queryKey: ['feasibility', projectId],
    queryFn:  () => feasApi.get(projectId).then(r => r.data),
    retry: false,
  })

  const runMutation = useMutation({
    mutationFn: () => feasApi.run(projectId, {
      ...form,
      client_name: form.client_name || project?.client_org || project?.name || 'Unknown',
      description: form.description || project?.name || '',
    }),
    onSuccess: () => {
      qc.invalidateQueries(['feasibility', projectId])
      setRerunMode(false)
    },
  })

  const overrideMutation = useMutation({
    mutationFn: () => feasApi.override(projectId),
    onSuccess:  () => qc.invalidateQueries(['project', projectId]),
  })

  if (isLoading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '13px' }}>
      Loading feasibility report…
    </div>
  )

  const hasReport = !!report && !rerunMode
  const cfg = STATUS_CFG[report?.overall_status] || STATUS_CFG.amber
  const result = report?.result || {}
  const actions = deriveActions(result)
  const nfrs = result.injected_nfrs || []
  const feasResolved = project?.feasResolved || {}
  const resolvedCount = actions.filter(a => feasResolved[a.id]).length
  const openCount = actions.length - resolvedCount
  const userRole = user?.role?.value || user?.role

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Disclaimer */}
      <div style={{
        background: 'color-mix(in srgb, var(--amber) 8%, var(--surface))',
        border: '1px solid color-mix(in srgb, var(--amber) 30%, transparent)',
        borderRadius: '10px', padding: '12px 16px',
        display: 'flex', gap: '10px', alignItems: 'flex-start',
        fontSize: '12.5px', color: 'var(--ink)',
      }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>⚠️</span>
        <div>
          <b>Simulated checks — not production-verified.</b> Sanctions, geopolitical, and regulatory results are generated by Gemini using training-data reference lists, not live OFAC/UN/EU/UK API calls. Do not use these results as the sole basis for compliance decisions. Engage legal/compliance counsel before proceeding in regulated markets.
        </div>
      </div>

      {/* Form — shown when no report or re-run mode */}
      {!hasReport && (
        <RunForm form={form} setForm={setForm} onRun={() => runMutation.mutate()} isPending={runMutation.isPending} />
      )}

      {/* Report */}
      {hasReport && (
        <>
          {/* Status banner */}
          <div style={{
            background: cfg.bg,
            border: `1px solid ${cfg.border}`,
            borderRadius: '12px',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: cfg.color, letterSpacing: '-.01em', minWidth: '56px' }}>
              {cfg.shortLabel}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.55 }}>
                {result.overall_status_reasoning || 'Feasibility assessment complete.'}
              </p>
            </div>
            {userRole === 'admin' && report.overall_status === 'red' && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => overrideMutation.mutate()}
                disabled={overrideMutation.isPending}
              >
                Admin Override
              </button>
            )}
          </div>

          {/* 2×2 check cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

            {/* 1 · Sanctions */}
            <CheckCard num="1" title="Sanctions check" tags={[
              { label: 'OFAC', cls: 'gray' }, { label: 'UN', cls: 'gray' },
              { label: 'EU CFSP', cls: 'gray' }, { label: 'UK OFSI', cls: 'gray' },
            ]}>
              {result.sanctions ? (
                parseSanctionLines(result.sanctions.detail).map((l, i) => (
                  <CheckLine key={i} icon={l.warn ? 'red' : 'ok'} text={l.text} />
                ))
              ) : (
                <CheckLine icon="ok" text="No sanctions data returned." />
              )}
            </CheckCard>

            {/* 2 · Geopolitical */}
            <CheckCard num="2" title="Geopolitical risk">
              {result.geopolitical ? (
                <>
                  <CheckLine
                    icon={result.geopolitical.risk_level === 'low' ? 'ok' : result.geopolitical.risk_level === 'medium' ? 'warn' : 'red'}
                    text={result.geopolitical.stability_detail || result.geopolitical.detail || `Risk level: ${result.geopolitical.risk_level}`}
                  />
                  {result.geopolitical.data_sovereignty_notes && !/^no specific/i.test(result.geopolitical.data_sovereignty_notes) && (
                    <CheckLine icon="warn" text={result.geopolitical.data_sovereignty_notes} />
                  )}
                  {result.geopolitical.risk_level === 'low' && (
                    <CheckLine icon="ok" text="No trade restrictions on planned tech stack identified." />
                  )}
                </>
              ) : (
                <CheckLine icon="ok" text="No geopolitical data returned." />
              )}
            </CheckCard>

            {/* 3 · Regulatory mapping */}
            <CheckCard num="3" title="Regulatory mapping" tags={[
              { label: 'country + industry', cls: 'violet' },
            ]}>
              {(result.regulatory?.required_compliances || []).length > 0 ? (
                result.regulatory.required_compliances.map((c, i) => (
                  <CheckLine key={i}
                    icon={result.regulatory.status === 'complex' ? 'warn' : 'warn'}
                    text={`${c.framework}${c.reason ? ` — ${c.reason}` : ''}${c.article_or_section ? ` (${c.article_or_section})` : ''}`}
                  />
                ))
              ) : result.regulatory?.detail ? (
                <CheckLine icon="ok" text={result.regulatory.detail} />
              ) : (
                <CheckLine icon="ok" text="No specific regulatory requirements identified." />
              )}
            </CheckCard>

            {/* 4 · Web search */}
            <CheckCard num="4" title="Live web search — latest updates">
              {(result.web_search?.findings || []).length > 0 ? (
                result.web_search.findings.map((f, i) => (
                  <CheckLine key={i} icon="news"
                    text={`${f.date ? `${f.date} — ` : ''}${f.summary}`}
                  />
                ))
              ) : (
                <CheckLine icon="news" text={
                  result.web_search?.stub_warning
                    ? 'Live search unavailable — manual verification recommended.'
                    : 'No significant regulatory developments found in the last 12 months.'
                } />
              )}
            </CheckCard>
          </div>

          {/* Recommended actions */}
          {actions.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>Recommended actions to improve feasibility</span>
                {openCount > 0 && (
                  <span className="badge amber" style={{ fontSize: '11px' }}>{openCount} open</span>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setRerunMode(true)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/>
                  </svg>
                  Re-run with changes
                </button>
              </div>
              <div style={{ padding: '6px 20px 4px', textAlign: 'right', fontSize: '12px', color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)' }}>
                {resolvedCount}/{actions.length} addressed
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {actions.map((a, i) => {
                  const resolved = !!feasResolved[a.id]
                  return (
                    <div key={a.id} style={{
                      display: 'flex', gap: '14px', padding: '16px 20px',
                      borderBottom: i < actions.length - 1 ? '1px solid var(--line)' : 'none',
                      opacity: resolved ? 0.55 : 1,
                    }}>
                      <span style={{ color: 'var(--amber)', fontSize: '16px', flexShrink: 0, marginTop: 2 }}>⚠</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <Tag label="WARNING" cls="amber" />
                          <Tag label={a.category} cls="gray" />
                        </div>
                        <p style={{ margin: '0 0 4px', fontSize: '13.5px', fontWeight: 500 }}>{a.issue}</p>
                        <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                          <b>Recommended:</b> {a.recommendation}
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => toggleFeasAction(projectId, a.id, !resolved)}
                          >
                            {resolved ? 'Addressed ✓' : 'Mark addressed'}
                          </button>
                          {a.hasPrdAction && !resolved && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => navigate(`/projects/${projectId}/prd`)}
                            >
                              Open §6 to add requirement
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                Address each item, then <b>Re-run with changes</b> to re-screen and update the feasibility rating.
              </div>
            </div>
          )}

          {/* Injected NFRs */}
          {nfrs.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>Compliance requirements auto-added to PRD §6</span>
                <span className="badge teal" style={{ fontSize: '11px' }}>{nfrs.length}</span>
              </div>
              <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {nfrs.map((n, i) => (
                  <div key={i} style={{
                    border: `1px solid color-mix(in srgb, var(--amber) 35%, transparent)`,
                    borderRadius: '10px',
                    padding: '14px 16px',
                    background: 'color-mix(in srgb, var(--amber) 5%, transparent)',
                  }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--amber)', fontWeight: 600, marginBottom: '6px' }}>
                      NFR-C{i + 1}
                    </div>
                    <p style={{ margin: '0 0 8px', fontSize: '13.5px', lineHeight: 1.5 }}>{n.content}</p>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-soft)' }}>
                      [Source: {n.source} | Regulation: {n.regulation}]
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/projects/${projectId}/prd`)}
                >
                  Review in PRD → accept / edit / remove
                </button>
              </div>
            </div>
          )}

          {/* No actions / all clear */}
          {actions.length === 0 && nfrs.length === 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '32px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '13px' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>✓</div>
              No recommended actions — project is clear to proceed.
            </div>
          )}
        </>
      )}
    </div>
  )
}
