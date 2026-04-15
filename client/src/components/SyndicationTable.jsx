import { useState, useMemo, useEffect } from 'react'
import { PAGE_SIZE } from '../utils/constants.js'
import Pagination from './Pagination.jsx'

const s = {
  wrap: { padding: '16px 20px' },
  meta: { fontSize: 11, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 },
  controls: { display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' },
  searchWrap: { position: 'relative', flex: 1, minWidth: 180, maxWidth: 340 },
  search: {
    width: '100%', padding: '8px 32px 8px 12px',
    background: 'var(--surface2)', border: '1px solid var(--border2)',
    borderRadius: 2, color: 'var(--text)', fontSize: 12, outline: 'none', boxSizing: 'border-box',
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

function formatSize(bytes) {
  if (!bytes) return null
  const mb = parseInt(bytes) / 1024 / 1024
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)} GB`
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(parseInt(bytes) / 1024).toFixed(0)} KB`
}

export default function SyndicationTable({ data }) {
  const { artefacts = [], categories = [], feedTitle, feedUpdated } = data
  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [sortCol, setSortCol]   = useState('published')
  const [sortDir, setSortDir]   = useState('desc')
  const [page, setPage]         = useState(1)

  const catOptions = useMemo(() => ['all', ...categories.map(c => c.term).sort()], [categories])

  const filtered = useMemo(() => {
    let res = artefacts
    if (catFilter !== 'all') res = res.filter(a => a.categoryTerm === catFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      res = res.filter(a =>
        (a.title || '').toLowerCase().includes(q) ||
        (a.categoryTerm || '').toLowerCase().includes(q) ||
        (a.categoryLabel || '').toLowerCase().includes(q) ||
        (a.summary || '').toLowerCase().includes(q) ||
        (a.contentVersion || '').toLowerCase().includes(q)
      )
    }
    return [...res].sort((a, b) => {
      const av = a[sortCol] || ''
      const bv = b[sortCol] || ''
      const cmp = av.localeCompare(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [artefacts, search, catFilter, sortCol, sortDir])

  useEffect(() => { setPage(1) }, [search, catFilter, sortCol])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  const si = col => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div style={s.wrap}>
      {(feedTitle || feedUpdated) && (
        <div style={s.meta}>
          {feedTitle && <>Feed: <span style={{ color: 'var(--text)' }}>{feedTitle}</span></>}
          {feedUpdated && <> · Updated: <span style={{ color: 'var(--text)' }}>{new Date(feedUpdated).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</span></>}
          {' · '}
          <span style={{ color: 'var(--text)' }}>{artefacts.length}</span> total entries across <span style={{ color: 'var(--text)' }}>{categories.length}</span> categories
        </div>
      )}

      <div style={s.controls}>
        <div style={s.searchWrap}>
          <input
            style={s.search}
            placeholder="Search title, category, version…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button style={s.clearBtn} onClick={() => setSearch('')} title="Clear search">×</button>}
        </div>
        <select style={s.select} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          {catOptions.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'All categories' : c.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <span style={s.countLabel}>
          {filtered.length !== artefacts.length
            ? `${filtered.length} of ${artefacts.length} shown`
            : `${artefacts.length} entries`
          }
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>⊘</div>
          No entries match your filters.
          {search && (
            <div style={{ marginTop: 6 }}>
              <button style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border2)', borderRadius: 2, color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }} onClick={() => setSearch('')}>
                Clear search
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
                  <th style={s.th} onClick={() => handleSort('title')}>Title{si('title')}</th>
                  <th style={s.th} onClick={() => handleSort('categoryTerm')}>Category{si('categoryTerm')}</th>
                  <th style={s.th} onClick={() => handleSort('contentVersion')}>Version{si('contentVersion')}</th>
                  <th style={s.th} onClick={() => handleSort('published')}>Published{si('published')}</th>
                  <th style={s.th} onClick={() => handleSort('updated')}>Updated{si('updated')}</th>
                  <th style={s.th}>Download</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((a, i) => (
                  <tr key={i} className="row-hover">
                    <td style={{ ...s.td, maxWidth: 300 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: a.summary ? 2 : 0 }}>
                        {a.title || a.id}
                      </div>
                      {a.summary && (
                        <div style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.summary}>
                          {a.summary}
                        </div>
                      )}
                    </td>
                    <td style={s.td}>
                      <span className="badge" style={{ background: 'rgba(255,209,102,0.08)', border: '1px solid rgba(255,209,102,0.2)', color: 'var(--yellow)', fontFamily: 'var(--font-mono)' }}>
                        {a.categoryTerm || '—'}
                      </span>
                      {a.categoryLabel && a.categoryLabel !== a.categoryTerm && (
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>{a.categoryLabel}</div>
                      )}
                    </td>
                    <td style={{ ...s.td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                      {a.contentVersion || '—'}
                    </td>
                    <td style={{ ...s.td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {a.published ? new Date(a.published).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ ...s.td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {a.updated ? new Date(a.updated).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={s.td}>
                      {a.downloadHref ? (
                        <a
                          href={a.downloadHref}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                          onMouseOver={e => e.currentTarget.style.opacity = '0.7'}
                          onMouseOut={e => e.currentTarget.style.opacity = '1'}
                        >
                          ↓ {a.downloadType?.split('/').pop()?.toUpperCase() || 'File'}
                          {a.downloadLength && (
                            <span style={{ color: 'var(--text3)', fontSize: 10 }}>({formatSize(a.downloadLength)})</span>
                          )}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} accentColor="var(--yellow)" />
        </>
      )}
    </div>
  )
}
