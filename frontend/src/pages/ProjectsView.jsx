import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import useProjectStore from '../store/projectStore'
import { apiProjectToStore } from '../store/projectStore'
import useAppStore from '../store/appStore'
import { projects as projectsApi } from '../services/api'
import { FeasBadge, MeterColor, AvatarStack } from '../components/Badge'
import { STAGES, STAGE_BADGE } from '../data/mockData'

const STAGE_OPTIONS = [
  { value: '', label: 'All stages' },
  { value: 'intake', label: 'Intake' },
  { value: 'processing', label: 'Processing' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'gap_review', label: 'Gap review' },
  { value: 'feasibility', label: 'Feasibility' },
  { value: 'client_review', label: 'Client review' },
  { value: 'approved', label: 'Approved' },
]


export default function ProjectsView() {
  const navigate = useNavigate()
  const { projects, userById, hasMore, loadMoreProjects, loading } = useProjectStore()
  const { openModal } = useAppStore()
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(id)
  }, [search])

  async function handleLoadMore() {
    setLoadingMore(true)
    await loadMoreProjects()
    setLoadingMore(false)
  }

  const isFiltering = !!(debouncedSearch.trim() || stageFilter)

  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ['projects-search', debouncedSearch, stageFilter],
    queryFn: () => projectsApi.list({
      q: debouncedSearch.trim() || undefined,
      stage: stageFilter || undefined,
      limit: 100,
    }).then(r => r.data.map(apiProjectToStore)),
    enabled: isFiltering,
    staleTime: 15_000,
  })

  const filtered = isFiltering ? (searchResults || []) : projects

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center', gap: '12px', color: 'var(--ink-soft)' }}>
        <div style={{ fontSize: '24px' }}>⏳</div>
        <p>Loading projects…</p>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>🗂️</div>
        <h3 style={{ margin: 0, fontSize: '20px' }}>No projects yet</h3>
        <p style={{ margin: 0, color: 'var(--ink-soft)', maxWidth: '380px', lineHeight: 1.6 }}>
          Create a project, then upload call recordings, documents, or chat exports to start building your PRD.
        </p>
        <button className="btn btn-primary" onClick={() => openModal('newproj')} style={{ marginTop: '8px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14"/></svg>
          New project
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: '12px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or client…"
          style={{ flex: '1', minWidth: '180px', padding: '7px 12px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '13.5px', background: 'var(--surface)', color: 'var(--ink)' }}
        />
        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '13.5px', background: 'var(--surface)', color: 'var(--ink)' }}
        >
          {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(search || stageFilter) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStageFilter('') }}>
            Clear filters
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
          {isSearching ? 'Searching…' : `${filtered.length}${isFiltering ? '' : ` of ${projects.length}`} project${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ink-soft)' }}>
          No projects match your search. <button className="linkbtn" onClick={() => { setSearch(''); setStageFilter('') }}>Clear filters</button>
        </div>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Project</th><th>Client</th><th>Stage</th><th>Feasibility</th><th>Completeness</th><th>Team</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const teamUsers = p.team.map(id => userById(id)).filter(Boolean)
                const color = MeterColor(p.completeness)
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong><br />
                      <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{p.industry} · {p.deploy} · upd {p.updated}</span>
                    </td>
                    <td>{p.client}<br /><span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{p.country}</span></td>
                    <td>
                      <span className={`badge ${p.status === 'blocked' ? 'red' : (STAGE_BADGE[p.stage] ?? 'gray')}`}>
                        <span className="dot" />{STAGES[p.stage] || p.statusLabel}
                      </span>
                    </td>
                    <td><FeasBadge score={p.feas} /></td>
                    <td style={{ minWidth: '150px' }}>
                      <div className="meterline">
                        <div className="meter"><i style={{ width: `${p.completeness}%`, background: color }} /></div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{p.completeness}%</span>
                      </div>
                    </td>
                    <td><AvatarStack users={teamUsers} /></td>
                    <td>
                      {p.status === 'blocked'
                        ? <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/projects/${p.id}/feasibility`)}>Report</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/projects/${p.id}`)}>Open</button>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && !isFiltering && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button className="btn btn-ghost" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more projects'}
          </button>
        </div>
      )}
      <p style={{ marginTop: '14px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
        Tip: the stage column tracks the lifecycle — Intake → Processing → Drafted → Gap review → Feasibility → Client review → Approved.
      </p>
    </>
  )
}
