import { useMemo, useState } from 'react'
import { daysSince, fmtAge, getStaleness, RELEASE_SCHEDULES } from '../utils/staleness.js'
import { FHIR_TYPES, TYPE_COLORS } from '../utils/constants.js'

// ─── Analysis Engine ──────────────────────────────────────────────────────────

function computeAnalysis(auditData) {
  if (!auditData) return null

  const allFhir = FHIR_TYPES.flatMap(rt =>
    (auditData.fhir[rt] || []).map(r => ({ ...r, _type: rt }))
  )

  // 1. Staleness — all non-retired resources, oldest first
  const staleItems = allFhir
    .filter(r => r.status !== 'retired')
    .map(r => {
      const days = daysSince(r.date)
      const s = getStaleness(days, r.status)
      return { ...r, _days: days, _staleness: s }
    })
    .sort((a, b) => (b._days ?? -1) - (a._days ?? -1))

  const criticalCount = staleItems.filter(r => r._staleness.level === 'critical').length
  const warningCount  = staleItems.filter(r => r._staleness.level === 'warning').length
  const cautionCount  = staleItems.filter(r => r._staleness.level === 'caution').length

  // 2. Version duplicates — same canonical URL on multiple resources
  const byUrl = {}
  allFhir.forEach(r => {
    if (!r.url) return
    if (!byUrl[r.url]) byUrl[r.url] = []
    byUrl[r.url].push(r)
  })
  const duplicates = Object.entries(byUrl)
    .filter(([, res]) => res.length > 1)
    .map(([url, res]) => ({
      url,
      resourceType: res[0]._type,
      total: res.length,
      activeCount: res.filter(r => r.status === 'active').length,
      resources: [...res].sort((a, b) => (b.version || '').localeCompare(a.version || '')),
    }))
    .sort((a, b) => b.activeCount - a.activeCount || b.total - a.total)

  const conflictDuplicates = duplicates.filter(d => d.activeCount > 1)

  // 3. Cross-reference integrity — ValueSets referencing retired CodeSystems
  const csMap = {}
  ;(auditData.fhir?.CodeSystem || []).forEach(cs => {
    if (cs.url) csMap[cs.url] = { status: cs.status, title: cs.title || cs.name || cs.url }
  })

  const crossRefIssues = []
  ;(auditData.fhir?.ValueSet || []).forEach(vs => {
    if (!vs.compose?.include) return
    const seen = new Set()
    vs.compose.include.forEach(inc => {
      const sys = inc.system
      if (!sys || seen.has(sys)) return
      seen.add(sys)
      const cs = csMap[sys]
      if (cs && cs.status === 'retired') {
        crossRefIssues.push({ vs, system: sys, csTitle: cs.title, issue: 'References retired CodeSystem' })
      }
    })
  })

  // Check if compose is missing on all ValueSets (means _elements didn't include it)
  const vsWithCompose = (auditData.fhir?.ValueSet || []).filter(vs => vs.compose).length
  const composeMissing = vsWithCompose === 0 && (auditData.fhir?.ValueSet || []).length > 0

  // 4. Publisher activity — oldest first (most inactive publishers at top)
  const pubMap = {}
  allFhir.forEach(r => {
    const pub = r.publisher || '(Unknown publisher)'
    if (!pubMap[pub]) pubMap[pub] = { name: pub, resources: [], types: new Set() }
    pubMap[pub].resources.push(r)
    pubMap[pub].types.add(r._type)
  })

  const publishers = Object.values(pubMap).map(p => {
    const dates = p.resources.map(r => r.date).filter(Boolean).sort()
    const latest = dates[dates.length - 1] || null
    const days   = daysSince(latest)
    const statuses = p.resources.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1; return acc
    }, {})
    return {
      name: p.name,
      count: p.resources.length,
      types: Array.from(p.types),
      latestDate: latest,
      oldestDate: dates[0] || null,
      daysSinceActivity: days,
      staleness: getStaleness(days, 'active'),
      statuses,
    }
  }).sort((a, b) => (b.daysSinceActivity ?? -1) - (a.daysSinceActivity ?? -1))

  const inactivePublishers = publishers.filter(p => p.staleness.level === 'warning' || p.staleness.level === 'critical').length

  // 5. Release currency — syndication latest per category vs known schedules
  const catLatest = {}
  ;(auditData.syndication?.artefacts || []).forEach(a => {
    const t = a.categoryTerm
    if (!catLatest[t] || (a.published || '') > (catLatest[t].published || ''))
      catLatest[t] = a
  })

  const releaseStatus = RELEASE_SCHEDULES.map(sched => {
    const matches = Object.entries(catLatest).filter(([term]) => sched.match(term))
    // pick latest across all matching categories
    const best = matches.sort((a, b) =>
      (b[1].published || '').localeCompare(a[1].published || '')
    )[0]

    if (!best) return { ...sched, found: false, days: null, status: 'missing' }

    const [term, artefact] = best
    const days = daysSince(artefact.published)
    const status = days > sched.maxDays * 1.5 ? 'overdue' : days > sched.maxDays ? 'due' : 'ok'
    return { ...sched, found: true, categoryTerm: term, artefact, days, status }
  })

  const overdueReleases = releaseStatus.filter(r => r.status !== 'ok').length

  return {
    staleItems, criticalCount, warningCount, cautionCount,
    duplicates, conflictDuplicates,
    crossRefIssues, composeMissing,
    publishers, inactivePublishers,
    releaseStatus, overdueReleases,
    totalIssues: criticalCount + warningCount + conflictDuplicates.length + crossRefIssues.length + overdueReleases,
  }
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const th = {
  padding: '8px 12px', textAlign: 'left',
  fontSize: 10, fontFamily: 'var(--font-mono)',
  color: 'var(--text2)', letterSpacing: '0.06em', textTransform: 'uppercase',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', userSelect: 'none',
}
const td = { padding: '9px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', fontSize: 12 }
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const emptyMsg = (msg) => (
  <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text2)', fontSize: 12 }}>
    {msg}
  </div>
)
const sectionCard = (children) => (
  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, marginBottom: 20, overflow: 'hidden' }}>
    {children}
  </div>
)
const sectionHead = (title, count, countColor, note) => (
  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
    {count != null && (
      <span style={{
        fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 2,
        background: count > 0 ? `${countColor}18` : 'var(--border)',
        color: count > 0 ? countColor : 'var(--text3)',
        border: `1px solid ${count > 0 ? countColor : 'var(--border)'}44`,
      }}>{count} {count === 1 ? 'issue' : 'issues'}</span>
    )}
    {note && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>{note}</span>}
  </div>
)

function StaleBadge({ s }) {
  return <span className={`badge stale--${s.level}`}>{s.label}</span>
}

function StatusBadge({ status }) {
  return <span className={`badge badge--${status || 'unknown'}`}>{status || 'unknown'}</span>
}

// ─── Section: Summary Bar ─────────────────────────────────────────────────────

function SummaryBar({ a }) {
  const cards = [
    { label: 'Total Issues', value: a.totalIssues, color: a.totalIssues > 0 ? 'var(--red)' : 'var(--green)' },
    { label: 'Abandoned / Critical', value: a.criticalCount, color: 'var(--red)' },
    { label: 'Stale / Warning', value: a.warningCount, color: 'var(--accent3)' },
    { label: 'Active Conflicts', value: a.conflictDuplicates.length, color: 'var(--yellow)' },
    { label: 'Cross-ref Issues', value: a.crossRefIssues.length, color: 'var(--yellow)' },
    { label: 'Overdue Releases', value: a.overdueReleases, color: 'var(--accent3)' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3,
          padding: '14px 16px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: c.color, opacity: c.value > 0 ? 1 : 0.2 }} />
          <div style={{ fontSize: 26, fontWeight: 800, color: c.value > 0 ? c.color : 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
            {c.value}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Section 1: Release Currency ─────────────────────────────────────────────

function CurrencySection({ a }) {
  const STATUS_CONFIG = {
    ok:      { color: 'var(--green)',   label: 'Current' },
    due:     { color: 'var(--yellow)',  label: 'Due' },
    overdue: { color: 'var(--accent3)', label: 'Overdue' },
    missing: { color: 'var(--red)',     label: 'Not found' },
  }

  return sectionCard(<>
    {sectionHead(
      'Release Currency',
      a.overdueReleases,
      'var(--accent3)',
      'Syndication feed vs. expected release schedules'
    )}
    <div style={{ overflowX: 'auto' }}>
      <table style={tbl}>
        <thead>
          <tr>
            {['Product', 'Expected Frequency', 'Latest on NCTS', 'Category Term', 'Age', 'Status', 'Note'].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {a.releaseStatus.map((r, i) => {
            const cfg = STATUS_CONFIG[r.status]
            return (
              <tr key={i}
                onMouseOver={e => e.currentTarget.style.background = 'var(--surface)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ ...td, fontWeight: 600, color: 'var(--text)' }}>{r.name}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>{r.frequency}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>
                  {r.found && r.artefact?.published ? new Date(r.artefact.published).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </td>
                <td style={{ ...td, fontSize: 11 }}>
                  {r.found
                    ? <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--yellow)', background: 'rgba(255,209,102,0.08)', padding: '2px 6px', borderRadius: 2 }}>{r.categoryTerm}</span>
                    : <span style={{ color: 'var(--text3)' }}>—</span>
                  }
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: cfg.color, whiteSpace: 'nowrap' }}>
                  {r.found ? fmtAge(r.days) : '—'}
                </td>
                <td style={td}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 2, fontSize: 10, fontFamily: 'var(--font-mono)',
                    background: `${cfg.color}18`, color: cfg.color,
                  }}>{cfg.label}</span>
                </td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text3)' }}>{r.note}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </>)
}

// ─── Section 2: Staleness Report ─────────────────────────────────────────────

function StalenessSection({ a }) {
  const [filter, setFilter] = useState('all')

  const FILTER_OPTS = [
    { id: 'all',      label: 'All',      count: a.staleItems.length },
    { id: 'critical', label: 'Abandoned',count: a.criticalCount },
    { id: 'warning',  label: 'Stale',    count: a.warningCount },
    { id: 'caution',  label: 'Aging',    count: a.cautionCount },
  ]

  const shown = filter === 'all'
    ? a.staleItems
    : a.staleItems.filter(r => r._staleness.level === filter)

  const totalIssues = a.criticalCount + a.warningCount

  return sectionCard(<>
    {sectionHead('Staleness Report', totalIssues, 'var(--red)', 'FHIR resources by age — oldest first, retired excluded')}

    {/* Filter pills */}
    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
      {FILTER_OPTS.map(f => (
        <button
          key={f.id}
          onClick={() => setFilter(f.id)}
          style={{
            padding: '4px 12px', borderRadius: 2, fontSize: 11,
            background: filter === f.id ? 'var(--accent)' : 'transparent',
            border: `1px solid ${filter === f.id ? 'var(--accent)' : 'var(--border2)'}`,
            color: filter === f.id ? '#000' : 'var(--text2)', cursor: 'pointer',
          }}
        >
          {f.label}
          <span style={{ marginLeft: 6, opacity: 0.7 }}>{f.count}</span>
        </button>
      ))}
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>
        {shown.length} shown
      </span>
    </div>

    {shown.length === 0
      ? emptyMsg(filter === 'all' ? 'No non-retired resources found.' : `No ${filter} resources.`)
      : <div style={{ overflowX: 'auto' }}>
          <table style={tbl}>
            <thead>
              <tr>
                {['Type', 'Title / Name', 'Status', 'Publisher', 'Last Updated', 'Age', 'Flag'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} className="row-hover">
                  <td style={td}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: 2, background: 'var(--bg)', color: TYPE_COLORS[r._type], border: `1px solid ${TYPE_COLORS[r._type]}33` }}>
                      {r._type}
                    </span>
                  </td>
                  <td style={{ ...td, maxWidth: 260 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title || r.name || r.id}
                    </div>
                    {r.url && (
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {r.url}
                      </div>
                    )}
                  </td>
                  <td style={td}><StatusBadge status={r.status} /></td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.publisher || '—'}
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {r.date ? r.date.slice(0, 10) : '—'}
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: r._staleness.color, whiteSpace: 'nowrap' }}>
                    {fmtAge(r._days)}
                  </td>
                  <td style={td}><StaleBadge s={r._staleness} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    }
  </>)
}

// ─── Section 3: Version Duplicates ───────────────────────────────────────────

function DuplicatesSection({ a }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? a.duplicates : a.duplicates.slice(0, 25)

  return sectionCard(<>
    {sectionHead(
      'Version Duplicates',
      a.conflictDuplicates.length,
      'var(--yellow)',
      `${a.duplicates.length} canonical URLs have multiple resources — ${a.conflictDuplicates.length} with multiple active versions`
    )}

    {a.duplicates.length === 0
      ? emptyMsg('No duplicate canonical URLs found — each URL maps to a unique resource.')
      : <>
          <div style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              <thead>
                <tr>
                  {['Type', 'Canonical URL', 'Total Versions', 'Active', 'Versions on Server', 'Flag'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((d, i) => {
                  const conflict = d.activeCount > 1
                  return (
                    <tr key={i}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--surface)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={td}>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: 2, background: 'var(--bg)', color: TYPE_COLORS[d.resourceType], border: `1px solid ${TYPE_COLORS[d.resourceType]}33` }}>
                          {d.resourceType}
                        </span>
                      </td>
                      <td style={{ ...td, maxWidth: 320 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={d.url}>{d.url}</div>
                        <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 2 }}>
                          {d.resources[0]?.title || d.resources[0]?.name || ''}
                        </div>
                      </td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center', color: 'var(--text)' }}>{d.total}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center', color: conflict ? 'var(--yellow)' : 'var(--text)' }}>{d.activeCount}</td>
                      <td style={{ ...td, fontSize: 11 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {d.resources.map((r, j) => (
                            <span key={j} style={{
                              fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 6px', borderRadius: 2,
                              background: r.status === 'active' ? 'rgba(6,214,160,0.1)' : 'rgba(74,85,104,0.2)',
                              color: r.status === 'active' ? 'var(--green)' : 'var(--text3)',
                            }}>
                              {r.version || r.id} ({r.status})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={td}>
                        {conflict
                          ? <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 2, background: 'rgba(255,209,102,0.1)', color: 'var(--yellow)' }}>Active conflict</span>
                          : <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 2, background: 'rgba(74,85,104,0.15)', color: 'var(--text3)' }}>Versioned</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {a.duplicates.length > 25 && (
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <button onClick={() => setShowAll(s => !s)} style={{
                padding: '5px 14px', background: 'transparent', border: '1px solid var(--border2)',
                borderRadius: 2, color: 'var(--text2)', fontSize: 11, cursor: 'pointer',
              }}>
                {showAll ? `Show fewer` : `Show all ${a.duplicates.length}`}
              </button>
            </div>
          )}
        </>
    }
  </>)
}

// ─── Section 4: Cross-Reference Integrity ────────────────────────────────────

function CrossRefSection({ a }) {
  return sectionCard(<>
    {sectionHead(
      'Cross-Reference Integrity',
      a.crossRefIssues.length,
      'var(--yellow)',
      'ValueSets that include from a retired CodeSystem'
    )}

    {a.composeMissing && (
      <div style={{
        margin: '12px 20px', padding: '10px 14px',
        background: 'rgba(0,136,255,0.05)', border: '1px solid rgba(0,136,255,0.2)', borderRadius: 3,
        fontSize: 12, color: 'var(--accent2)',
      }}>
        ⓘ ValueSet compose data was not returned by the server — cross-reference check is unavailable.
        Ensure the server supports the <code>_elements</code> parameter with <code>compose</code>.
      </div>
    )}

    {!a.composeMissing && a.crossRefIssues.length === 0
      ? emptyMsg('No cross-reference issues detected — all ValueSets reference active CodeSystems (that are on this server).')
      : !a.composeMissing && (
          <div style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              <thead>
                <tr>
                  {['ValueSet', 'ValueSet URL', 'References System', 'System Status', 'Issue'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.crossRefIssues.map((issue, i) => (
                  <tr key={i}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ ...td, maxWidth: 200 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {issue.vs.title || issue.vs.name || issue.vs.id}
                      </div>
                    </td>
                    <td style={{ ...td, maxWidth: 260 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={issue.vs.url}>{issue.vs.url}</div>
                    </td>
                    <td style={{ ...td, maxWidth: 240 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {issue.system}
                      </div>
                      {issue.csTitle && issue.csTitle !== issue.system && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{issue.csTitle}</div>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{ padding: '2px 8px', borderRadius: 2, fontSize: 10, fontFamily: 'var(--font-mono)', background: 'rgba(74,85,104,0.2)', color: 'var(--text3)' }}>
                        retired
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 2, background: 'rgba(255,209,102,0.1)', color: 'var(--yellow)' }}>
                        {issue.issue}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
    }
  </>)
}

// ─── Section 5: Publisher Activity ───────────────────────────────────────────

function PublishersSection({ a }) {
  return sectionCard(<>
    {sectionHead(
      'Publisher Activity',
      a.inactivePublishers,
      'var(--accent3)',
      `${a.publishers.length} publishers — sorted by inactivity (most inactive first)`
    )}

    {a.publishers.length === 0
      ? emptyMsg('No publisher data available.')
      : <div style={{ overflowX: 'auto' }}>
          <table style={tbl}>
            <thead>
              <tr>
                {['Publisher', 'Resources', 'Types', 'Status Breakdown', 'Last Active', 'Inactive For', 'Flag'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.publishers.map((p, i) => (
                <tr key={i} className="row-hover">
                  <td style={{ ...td, maxWidth: 220 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    {p.oldestDate && (
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginTop: 2 }}>
                        Since {p.oldestDate.slice(0, 10)}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center', color: 'var(--text)' }}>{p.count}</td>
                  <td style={{ ...td, fontSize: 11 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {p.types.map(t => (
                        <span key={t} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 2, background: 'var(--bg)', color: TYPE_COLORS[t], border: `1px solid ${TYPE_COLORS[t]}44` }}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...td, fontSize: 11 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(p.statuses).map(([s, n]) => {
                        const c = s === 'active' ? 'var(--green)' : s === 'retired' ? 'var(--text3)' : 'var(--yellow)'
                        return <span key={s} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: c }}>{s}: {n}</span>
                      })}
                    </div>
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {p.latestDate ? p.latestDate.slice(0, 10) : '—'}
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: p.staleness.color, whiteSpace: 'nowrap' }}>
                    {fmtAge(p.daysSinceActivity)}
                  </td>
                  <td style={td}><StaleBadge s={p.staleness} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    }
  </>)
}

// ─── Main AuditTab ────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'currency',   label: 'Release Currency',   countKey: 'overdueReleases',            color: 'var(--accent3)' },
  { id: 'staleness',  label: 'Staleness',           countKey: 'criticalCount',              color: 'var(--red)' },
  { id: 'duplicates', label: 'Version Duplicates',  countFn: a => a.conflictDuplicates.length, color: 'var(--yellow)' },
  { id: 'crossrefs',  label: 'Cross-References',    countKey: 'crossRefIssues.length',     color: 'var(--yellow)' },
  { id: 'publishers', label: 'Publisher Activity',  countKey: 'inactivePublishers',        color: 'var(--accent3)' },
]

export default function AuditTab({ auditData }) {
  const [activeSection, setActiveSection] = useState('currency')
  const analysis = useMemo(() => computeAnalysis(auditData), [auditData])

  if (!auditData) {
    return <div style={{ padding: 32, color: 'var(--text2)', fontSize: 13 }}>No data loaded.</div>
  }

  if (!analysis) {
    return <div style={{ padding: 32, color: 'var(--text2)', fontSize: 13 }}>Computing analysis…</div>
  }

  const getCount = s => {
    if (s.countFn) return s.countFn(analysis)
    const parts = s.countKey.split('.')
    let v = analysis
    for (const p of parts) v = v?.[p]
    return typeof v === 'number' ? v : 0
  }

  return (
    <div style={{ padding: 24 }}>
      <SummaryBar a={analysis} />

      {/* Section nav */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {SECTIONS.map(s => {
          const count = getCount(s)
          const active = activeSection === s.id
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '6px 14px', borderRadius: 2, fontSize: 12, fontFamily: 'var(--font-mono)',
                background: active ? s.color : 'transparent',
                border: `1px solid ${active ? s.color : 'var(--border2)'}`,
                color: active ? '#000' : (count > 0 ? s.color : 'var(--text2)'),
                cursor: 'pointer', fontWeight: active ? 700 : 400,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {s.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 2,
                  background: active ? 'rgba(0,0,0,0.2)' : `${s.color}22`,
                  color: active ? '#000' : s.color,
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {activeSection === 'currency'   && <CurrencySection   a={analysis} />}
      {activeSection === 'staleness'  && <StalenessSection  a={analysis} />}
      {activeSection === 'duplicates' && <DuplicatesSection a={analysis} />}
      {activeSection === 'crossrefs'  && <CrossRefSection   a={analysis} />}
      {activeSection === 'publishers' && <PublishersSection  a={analysis} />}

      <div style={{ marginTop: 12, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)', lineHeight: 1.7 }}>
        Analysis based on {Object.values(auditData.fhir || {}).flat().length} FHIR resources
        and {auditData.syndication?.totalCount || 0} syndication entries.
        Cross-reference checks only apply to CodeSystems served by this NCTS instance.
      </div>
    </div>
  )
}
