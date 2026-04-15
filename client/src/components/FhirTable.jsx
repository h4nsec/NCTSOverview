import { useState, useMemo, useEffect } from 'react'
import React from 'react'
import { daysSince, fmtAge, getStaleness } from '../utils/staleness.js'
import { PAGE_SIZE } from '../utils/constants.js'
import Pagination from './Pagination.jsx'

const s = {
  wrap: { padding: '16px 20px' },
  controls: { display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' },
  searchWrap: { position: 'relative', flex: 1, maxWidth: 380 },
  search: {
    width: '100%', padding: '8px 32px 8px 12px',
    background: 'var(--surface2)', border: '1px solid var(--border2)',
    borderRadius: 2, color: 'var(--text)', fontSize: 12,
    outline: 'none', boxSizing: 'border-box',
  },
  clearBtn: {
    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', color: 'var(--text3)',
    cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2,
  },
  select: {
    padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border2)',
    borderRadius: 2, color: 'var(--text2)', fontSize: 12, outline: 'none',
  },
  countLabel: { fontSize: 11, color: 'var(--text2)', marginLeft: 'auto', whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '8px 12px', textAlign: 'left', fontSize: 10,
    color: 'var(--text2)', letterSpacing: '0.06em', textTransform: 'uppercase',
    borderBottom: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  empty: { padding: '48px 20px', textAlign: 'center', color: 'var(--text2)', fontSize: 12 },
}

export default function FhirTable({ resources, resourceType, color }) {
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [staleFilter, setStaleFilter]   = useState('all')
  const [sortCol, setSortCol]           = useState('date')
  const [sortDir, setSortDir]           = useState('desc')
  const [page, setPage]                 = useState(1)
  const [expanded, setExpanded]         = useState(null)

  const statuses = useMemo(() => {
    const set = new Set(resources.map(r => r.status).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [resources])

  const filtered = useMemo(() => {
    let res = resources
    if (statusFilter !== 'all') res = res.filter(r => r.status === statusFilter)
    if (staleFilter !== 'all') {
      res = res.filter(r => {
        const level = getStaleness(daysSince(r.date), r.status).level
        if (staleFilter === 'issues') return ['critical', 'warning', 'caution'].includes(level)
        return level === staleFilter
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      res = res.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.name  || '').toLowerCase().includes(q) ||
        (r.url   || '').toLowerCase().includes(q) ||
        (r.id    || '').toLowerCase().includes(q) ||
        (r.publisher   || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      )
    }
    return [...res].sort((a, b) => {
      const av = sortCol === 'title' ? (a.title || a.name || '') : (a[sortCol] || '')
      const bv = sortCol === 'title' ? (b.title || b.name || '') : (b[sortCol] || '')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [resources, search, statusFilter, staleFilter, sortCol, sortDir])

  useEffect(() => { setPage(1); setExpanded(null) }, [search, statusFilter, staleFilter, sortCol])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  const si = col => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div style={s.wrap}>
      <div style={s.controls}>
        <div style={s.searchWrap}>
          <input
            style={s.search}
            placeholder="Search title, URL, publisher, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button style={s.clearBtn} onClick={() => setSearch('')} title="Clear">×</button>}
        </div>

        <select style={s.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {statuses.map(st => (
            <option key={st} value={st}>{st === 'all' ? 'All statuses' : st}</option>
          ))}
        </select>

        <select style={s.select} value={staleFilter} onChange={e => setStaleFilter(e.target.value)}>
          <option value="all">All ages</option>
          <option value="issues">Has issues</option>
          <option value="critical">Abandoned</option>
          <option value="warning">Stale</option>
          <option value="caution">Aging</option>
          <option value="ok">Current</option>
        </select>

        <span style={s.countLabel}>
          {filtered.length !== resources.length
            ? `${filtered.length} of ${resources.length} shown`
            : `${resources.length} artefacts`
          }
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>⊘</div>
          No artefacts match your filters.
          {(search || statusFilter !== 'all' || staleFilter !== 'all') && (
            <div style={{ marginTop: 10 }}>
              <button style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border2)', borderRadius: 2, color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}
                onClick={() => { setSearch(''); setStatusFilter('all'); setStaleFilter('all') }}>
                Clear all filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th} onClick={() => handleSort('title')}>Title / Name{si('title')}</th>
                  <th style={s.th} onClick={() => handleSort('url')}>URL / Canonical{si('url')}</th>
                  <th style={s.th} onClick={() => handleSort('version')}>Version{si('version')}</th>
                  <th style={s.th} onClick={() => handleSort('status')}>Status{si('status')}</th>
                  <th style={s.th} onClick={() => handleSort('date')}>Date{si('date')}</th>
                  <th style={s.th}>Age</th>
                  <th style={s.th} onClick={() => handleSort('publisher')}>Publisher{si('publisher')}</th>
                  {resourceType === 'CodeSystem' && <th style={{ ...s.th, textAlign: 'right' }}>Concepts</th>}
                </tr>
              </thead>
              <tbody>
                {paginated.map((r, i) => {
                  const key = r.id || r.url || i
                  const isExpanded = expanded === key
                  const days  = daysSince(r.date)
                  const stale = getStaleness(days, r.status)

                  return (
                    <React.Fragment key={key}>
                      <tr
                        className="row-clickable"
                        onClick={() => setExpanded(prev => prev === key ? null : key)}
                      >
                        <td style={{ ...s.td, maxWidth: 240 }}>
                          <span className="chevron" style={isExpanded ? { transform: 'rotate(90deg)', color: 'var(--accent)' } : {}}>▶</span>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.title || r.name || r.id}</span>
                          {r.title && r.name && (
                            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text2)', marginTop: 2 }}>{r.name}</div>
                          )}
                        </td>
                        <td style={{ ...s.td, maxWidth: 300 }} onClick={e => e.stopPropagation()}>
                          {r.url
                            ? <a href={r.url} target="_blank" rel="noreferrer"
                                style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text2)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={r.url}
                                onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'}
                                onMouseOut={e => e.currentTarget.style.color = 'var(--text2)'}
                              >{r.url}</a>
                            : <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
                          }
                        </td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color }}>{r.version || '—'}</span>
                        </td>
                        <td style={s.td}>
                          <span className={`badge badge--${r.status || 'unknown'}`}>{r.status || 'unknown'}</span>
                        </td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                            {r.date ? r.date.slice(0, 10) : '—'}
                          </span>
                        </td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                          <span className={`badge stale--${stale.level}`} title={stale.label}>
                            {fmtAge(days)}
                          </span>
                        </td>
                        <td style={{ ...s.td, fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.publisher || '—'}
                        </td>
                        {resourceType === 'CodeSystem' && (
                          <td style={{ ...s.td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {r.count != null ? r.count.toLocaleString() : '—'}
                          </td>
                        )}
                      </tr>

                      {isExpanded && (
                        <tr style={{ background: 'var(--surface2)' }}>
                          <td colSpan={resourceType === 'CodeSystem' ? 8 : 7} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 24px', fontSize: 12, marginBottom: 10 }}>
                              {[
                                { label: 'ID',           val: r.id,                 mono: true },
                                { label: 'Experimental', val: r.experimental != null ? (r.experimental ? 'Yes' : 'No') : null, color: r.experimental ? 'var(--yellow)' : 'var(--green)' },
                                { label: 'Jurisdiction', val: r.jurisdiction?.[0]?.coding?.[0]?.code || r.jurisdiction, mono: true },
                                { label: 'Staleness',    val: stale.label,          color: stale.color },
                                { label: 'Purpose',      val: r.purpose },
                                { label: 'Copyright',    val: r.copyright },
                              ].filter(f => f.val != null && f.val !== '').map(f => (
                                <div key={f.label}>
                                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{f.label}</div>
                                  <div style={{ fontFamily: f.mono ? 'var(--font-mono)' : undefined, color: f.color || 'var(--text2)', fontSize: 11 }}>{f.val}</div>
                                </div>
                              ))}
                            </div>
                            {r.description && (
                              <div>
                                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Description</div>
                                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 800 }}>
                                  {r.description.length > 600 ? r.description.slice(0, 600) + '…' : r.description}
                                </div>
                              </div>
                            )}
                            {r.contact?.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Contacts</div>
                                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                                  {r.contact.map((c, j) => (
                                    <span key={j} style={{ marginRight: 16 }}>
                                      {c.name}
                                      {c.telecom?.map((t, k) => <span key={k} style={{ marginLeft: 8, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{t.value}</span>)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {resourceType === 'ValueSet' && r.compose?.include?.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                                  Compose Includes ({r.compose.include.length} system{r.compose.include.length !== 1 ? 's' : ''})
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {r.compose.include.map((inc, j) => (
                                    <span key={j} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 2, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                                      {inc.system || '(no system)'}
                                      {inc.version ? ` | v${inc.version}` : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} accentColor={color} />

          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
            Click a row to expand details · Age colour: green = current, yellow = aging, orange = stale, red = abandoned
          </div>
        </>
      )}
    </div>
  )
}
