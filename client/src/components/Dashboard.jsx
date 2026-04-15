import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import * as XLSX from 'xlsx'
import SyndicationTable from './SyndicationTable.jsx'
import FhirTable from './FhirTable.jsx'
import AuditTab from './AuditTab.jsx'
import ServerTab from './ServerTab.jsx'
import { daysSince, fmtAge, getStaleness } from '../utils/staleness.js'
import { FHIR_TYPES, TYPE_COLORS } from '../utils/constants.js'

// ─── Export Utilities ────────────────────────────────────────────────────────

function buildCSV(auditData) {
  const rows = [['Source', 'ResourceType', 'Title', 'Name', 'URL', 'Version', 'Status', 'Date', 'Publisher', 'Description']]
  FHIR_TYPES.forEach(rt => {
    ;(auditData.fhir[rt] || []).forEach(r => {
      rows.push([
        'FHIR', r.resourceType || rt,
        r.title || '', r.name || '', r.url || '',
        r.version || '', r.status || '',
        r.date ? r.date.slice(0, 10) : '',
        r.publisher || '', (r.description || '').replace(/\n/g, ' '),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`))
    })
  })
  ;(auditData.syndication?.artefacts || []).forEach(a => {
    rows.push([
      'Syndication', a.categoryTerm || '',
      a.title || '', '', '',
      a.contentVersion || '', 'published',
      a.published ? a.published.slice(0, 10) : '',
      'ADHA', a.summary || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`))
  })
  return rows.map(r => r.join(',')).join('\n')
}

function downloadCSV(auditData) {
  const csv = buildCSV(auditData)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ncts-audit-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function downloadExcel(auditData) {
  const wb = XLSX.utils.book_new()
  const date = new Date().toLocaleString('en-AU')

  // Summary
  const summaryRows = [
    ['NCTS Artefact Audit Report'],
    ['Generated', date],
    [''],
    ['Resource Type', 'Total', 'Active', 'Retired', 'Draft', 'Other'],
  ]
  FHIR_TYPES.forEach(rt => {
    const res = auditData.fhir[rt] || []
    const active  = res.filter(r => r.status === 'active').length
    const retired = res.filter(r => r.status === 'retired').length
    const draft   = res.filter(r => r.status === 'draft').length
    summaryRows.push([rt, res.length, active, retired, draft, res.length - active - retired - draft])
  })
  summaryRows.push(['Syndication Entries', auditData.syndication?.totalCount || 0, '', '', '', ''])
  summaryRows.push(['', ''])
  summaryRows.push(['Syndication Categories'])
  ;(auditData.syndication?.categories || []).sort((a, b) => b.count - a.count).forEach(c => {
    summaryRows.push([c.term, c.count])
  })
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

  // FHIR type sheets
  FHIR_TYPES.forEach(rt => {
    const resources = auditData.fhir[rt] || []
    const headers = ['Title', 'Name', 'URL', 'Version', 'Status', 'Date', 'Publisher', 'Description', 'Purpose', 'Age (days)']
    if (rt === 'CodeSystem') headers.push('Concept Count')
    const rows = [headers, ...resources.map(r => {
      const days = daysSince(r.date)
      const row = [
        r.title || '', r.name || '', r.url || '',
        r.version || '', r.status || '',
        r.date ? r.date.slice(0, 10) : '',
        r.publisher || '', r.description || '', r.purpose || '',
        days ?? '',
      ]
      if (rt === 'CodeSystem') row.push(r.count ?? '')
      return row
    })]
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    sheet['!cols'] = [
      { wch: 40 }, { wch: 30 }, { wch: 60 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 30 }, { wch: 60 }, { wch: 40 }, { wch: 12 },
    ]
    XLSX.utils.book_append_sheet(wb, sheet, rt)
  })

  // Syndication sheet
  const syndRows = [
    ['Title', 'Summary', 'Category (Term)', 'Category (Label)', 'Version', 'Published', 'Updated', 'Download URL', 'File Type', 'Size (MB)'],
    ...(auditData.syndication?.artefacts || []).map(a => [
      a.title || '', a.summary || '', a.categoryTerm || '', a.categoryLabel || '',
      a.contentVersion || '',
      a.published ? a.published.slice(0, 10) : '',
      a.updated   ? a.updated.slice(0, 10)   : '',
      a.downloadHref || '', a.downloadType || '',
      a.downloadLength ? (parseInt(a.downloadLength) / 1024 / 1024).toFixed(2) : '',
    ])
  ]
  const syndSheet = XLSX.utils.aoa_to_sheet(syndRows)
  syndSheet['!cols'] = [{ wch: 50 }, { wch: 40 }, { wch: 22 }, { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 70 }, { wch: 20 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, syndSheet, 'Syndication')

  XLSX.writeFile(wb, `ncts-audit-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function openPrintReport(auditData) {
  const date = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })
  const totalFhir = FHIR_TYPES.reduce((s, rt) => s + (auditData.fhir[rt]?.length || 0), 0)

  const ts  = `border:1px solid #ccc;padding:6px 8px;background:#f0f0f0;text-align:left;font-weight:600;font-size:11px`
  const tds = `border:1px solid #ddd;padding:5px 8px;vertical-align:top;font-size:11px`
  const tbl = `border-collapse:collapse;width:100%;margin-bottom:20px`

  const fhirTables = FHIR_TYPES.map(rt => {
    const resources = auditData.fhir[rt] || []
    const rows = resources.map(r => {
      const days = daysSince(r.date)
      const s = getStaleness(days, r.status)
      return `<tr>
        <td style="${tds}">${r.title || r.name || r.id || ''}</td>
        <td style="${tds};font-family:monospace;font-size:10px;word-break:break-all">${r.url || ''}</td>
        <td style="${tds}">${r.version || '—'}</td>
        <td style="${tds}">${r.status || ''}</td>
        <td style="${tds}">${r.date ? r.date.slice(0, 10) : '—'}</td>
        <td style="${tds};color:${s.color}">${fmtAge(days)}</td>
        <td style="${tds}">${r.publisher || '—'}</td>
        ${rt === 'CodeSystem' ? `<td style="${tds};text-align:right">${r.count != null ? r.count.toLocaleString() : '—'}</td>` : ''}
      </tr>`
    }).join('')
    return `
      <h3 style="margin:20px 0 8px;font-size:13px">${rt} <span style="font-weight:normal;color:#666">(${resources.length})</span></h3>
      <table style="${tbl}">
        <thead><tr>
          <th style="${ts}">Title / Name</th><th style="${ts}">URL</th><th style="${ts}">Version</th>
          <th style="${ts}">Status</th><th style="${ts}">Date</th><th style="${ts}">Age</th>
          <th style="${ts}">Publisher</th>${rt === 'CodeSystem' ? `<th style="${ts}">Concepts</th>` : ''}
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="7" style="${tds};color:#999;text-align:center">No records</td></tr>`}</tbody>
      </table>`
  }).join('')

  const syndRows = (auditData.syndication?.artefacts || []).map(a => `
    <tr>
      <td style="${tds}">${a.title || ''}</td>
      <td style="${tds};font-family:monospace;font-size:10px">${a.categoryTerm || ''}</td>
      <td style="${tds}">${a.contentVersion || '—'}</td>
      <td style="${tds}">${a.published ? a.published.slice(0, 10) : '—'}</td>
      <td style="${tds}">${a.updated ? a.updated.slice(0, 10) : '—'}</td>
      <td style="${tds}">${a.downloadLength ? (parseInt(a.downloadLength) / 1024 / 1024).toFixed(1) + ' MB' : '—'}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <title>NCTS Audit Report — ${date}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:24px 32px}
    @media print{body{padding:0}.no-print{display:none}}
    h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:28px 0 12px;padding-bottom:6px;border-bottom:2px solid #222}
    .meta{color:#666;font-size:11px;margin-bottom:24px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
    .stat{border:1px solid #ddd;border-radius:4px;padding:12px 16px}
    .stat-val{font-size:28px;font-weight:700;line-height:1}.stat-label{font-size:10px;color:#666;margin-top:4px;text-transform:uppercase}
    .print-btn{position:fixed;top:16px;right:16px;padding:8px 20px;background:#222;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px}
  </style>
</head>
<body>
  <button class="no-print print-btn" onclick="window.print()">Print / Save PDF</button>
  <h1>NCTS Artefact Audit Report</h1>
  <div class="meta">
    National Clinical Terminology Service — Australian Digital Health Agency<br>
    Generated: ${date}
    ${auditData.syndication?.feedUpdated ? ` · Feed updated: ${new Date(auditData.syndication.feedUpdated).toLocaleDateString('en-AU')}` : ''}
  </div>
  <h2>Summary</h2>
  <div class="grid">
    <div class="stat"><div class="stat-val">${totalFhir + (auditData.syndication?.totalCount || 0)}</div><div class="stat-label">Total Artefacts</div></div>
    ${FHIR_TYPES.map(rt => `<div class="stat"><div class="stat-val">${auditData.fhir[rt]?.length || 0}</div><div class="stat-label">${rt}s</div></div>`).join('')}
    <div class="stat"><div class="stat-val">${auditData.syndication?.totalCount || 0}</div><div class="stat-label">Syndication Entries</div></div>
  </div>
  <h2>FHIR Resources</h2>${fhirTables}
  <h2>Syndication Feed <span style="font-weight:normal;color:#666">(${auditData.syndication?.totalCount || 0})</span></h2>
  <table style="${tbl}">
    <thead><tr>
      <th style="${ts}">Title</th><th style="${ts}">Category</th><th style="${ts}">Version</th>
      <th style="${ts}">Published</th><th style="${ts}">Updated</th><th style="${ts}">Size</th>
    </tr></thead>
    <tbody>${syndRows || `<tr><td colspan="6" style="${tds};color:#999;text-align:center">No records</td></tr>`}</tbody>
  </table>
</body></html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color, loading }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color || 'var(--accent)' }} />
      {loading
        ? <div style={{ height: 32, width: 60, background: 'var(--border2)', borderRadius: 2, animation: 'shimmer 1.5s infinite' }} />
        : <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{value ?? '—'}</div>
      }
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', padding: '8px 12px', borderRadius: 3, fontSize: 12 }}>
      <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: payload[0].color || 'var(--accent)' }}>{payload[0].value}</div>
    </div>
  )
}

function ExportMenu({ auditData, disabled }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        style={{
          padding: '6px 14px', background: 'transparent',
          border: '1px solid var(--border2)', borderRadius: 2,
          color: 'var(--text2)', fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
        onClick={() => !disabled && setOpen(o => !o)}
      >
        ↓ Export <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4,
            background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 3, zIndex: 100, minWidth: 160, overflow: 'hidden',
          }}>
            {[
              { label: 'CSV (.csv)',    icon: '≡', action: () => { downloadCSV(auditData); setOpen(false) } },
              { label: 'Excel (.xlsx)', icon: '⊞', action: () => { downloadExcel(auditData); setOpen(false) } },
              { label: 'Print / PDF',  icon: '⎙', action: () => { openPrintReport(auditData); setOpen(false) } },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 14px',
                  background: 'transparent', border: 'none',
                  color: 'var(--text)', fontSize: 12,
                  cursor: 'pointer', textAlign: 'left',
                  borderBottom: '1px solid var(--border)',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 14, opacity: 0.7 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ auditData }) {
  if (!auditData) return <div style={{ padding: 24, color: 'var(--text2)', fontSize: 13 }}>No data loaded.</div>

  const allRecent = FHIR_TYPES.flatMap(rt =>
    (auditData.fhir[rt] || []).map(r => ({ ...r, _type: rt }))
  ).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 15)

  return (
    <div style={{ padding: 24 }}>
      {/* Type breakdown cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {FHIR_TYPES.map(rt => {
          const resources = auditData.fhir[rt] || []
          const sc = resources.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})
          return (
            <div key={rt} style={{ background: 'var(--surface2)', border: `1px solid var(--border)`, borderTop: `2px solid ${TYPE_COLORS[rt]}`, borderRadius: 3, padding: 16 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: TYPE_COLORS[rt], letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{rt}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>{resources.length}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {Object.entries(sc).map(([status, count]) => (
                  <span key={status} style={{
                    fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 7px', background: 'var(--bg)', borderRadius: 2,
                    color: status === 'active' ? 'var(--green)' : status === 'retired' ? 'var(--text3)' : 'var(--yellow)',
                    border: '1px solid var(--border)',
                  }}>{status}: {count}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Combined recently updated */}
      <div style={{ fontSize: 11, color: 'var(--text2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
        Recently Updated — All Types
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Type', 'Title / Name', 'URL', 'Version', 'Status', 'Date', 'Age'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRecent.map((r, i) => {
              const days = daysSince(r.date)
              const s = getStaleness(days, r.status)
              return (
                <tr key={i} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: 2, background: 'var(--bg)', color: TYPE_COLORS[r._type], border: `1px solid ${TYPE_COLORS[r._type]}33` }}>{r._type}</span>
                  </td>
                  <td style={{ padding: '9px 12px', maxWidth: 220 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || r.name || r.id}</div>
                    {r.title && r.name && <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text2)', marginTop: 1 }}>{r.name}</div>}
                  </td>
                  <td style={{ padding: '9px 12px', maxWidth: 280 }}>
                    {r.url
                      ? <a href={r.url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text2)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                          onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'}
                          onMouseOut={e => e.currentTarget.style.color = 'var(--text2)'}
                        >{r.url}</a>
                      : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: TYPE_COLORS[r._type] }}>{r.version || '—'}</span>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 2, fontSize: 10, fontFamily: 'var(--font-mono)',
                      background: r.status === 'active' ? 'rgba(6,214,160,0.1)' : r.status === 'retired' ? 'rgba(74,85,104,0.3)' : 'rgba(255,209,102,0.1)',
                      color: r.status === 'active' ? 'var(--green)' : r.status === 'retired' ? 'var(--text3)' : 'var(--yellow)',
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {r.date ? r.date.slice(0, 10) : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: s.color, whiteSpace: 'nowrap' }}>
                    {fmtAge(days)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Syndication category chips */}
      {auditData.syndication && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text2)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '28px 0 10px' }}>
            Syndication Categories
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(auditData.syndication.categories || []).sort((a, b) => b.count - a.count).map(c => (
              <div key={c.term} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>{c.term.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard({ token, credentials, onLogout }) {
  const [auditData, setAuditData]       = useState(null)
  const [loading, setLoading]           = useState(false)
  const [loadingStage, setLoadingStage] = useState('')
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError]               = useState(null)
  const [activeTab, setActiveTab]       = useState('overview')
  const [activeFhirType, setActiveFhirType] = useState('CodeSystem')
  const [lastFetched, setLastFetched]   = useState(null)

  const fetchAudit = useCallback(async () => {
    setLoading(true)
    setError(null)
    setLoadingProgress(0)

    try {
      // Stage 1: parallel fetches (syndication + server metadata)
      setLoadingStage('Fetching server metadata and syndication feed…')
      const [syndResult, metaResult, termResult] = await Promise.allSettled([
        fetch('/api/syndication', { headers: { Authorization: token } }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch('/api/metadata',   { headers: { Authorization: token } }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch('/api/terminology-capabilities', { headers: { Authorization: token } }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ])

      const syndication = syndResult.status === 'fulfilled' ? syndResult.value : null
      const serverMeta  = metaResult.status  === 'fulfilled' ? metaResult.value  : null
      const termCaps    = termResult.status  === 'fulfilled' ? termResult.value  : null

      if (syndResult.status === 'rejected')  console.warn('Syndication failed:', syndResult.reason)
      if (metaResult.status === 'rejected')  console.warn('Metadata failed:', metaResult.reason)
      if (termResult.status === 'rejected')  console.warn('TermCaps failed:', termResult.reason)

      setLoadingProgress(20)

      // Stage 2-5: FHIR resource types
      const fhir = {}
      for (let i = 0; i < FHIR_TYPES.length; i++) {
        const rt = FHIR_TYPES[i]
        setLoadingStage(`Fetching ${rt}s…`)
        try {
          const fr = await fetch(`/api/fhir?type=${rt}`, { headers: { Authorization: token } })
          if (fr.ok) {
            const data = await fr.json()
            fhir[rt] = data.resources
          } else {
            fhir[rt] = []
          }
        } catch (e) {
          console.warn(`${rt} failed:`, e)
          fhir[rt] = []
        }
        setLoadingProgress(20 + Math.round(((i + 1) / FHIR_TYPES.length) * 80))
      }

      setAuditData({ syndication, fhir, serverMeta, termCaps })
      setLastFetched(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setLoadingStage('')
      setLoadingProgress(0)
    }
  }, [token])

  useEffect(() => { fetchAudit() }, [fetchAudit])

  const totalFhir = FHIR_TYPES.reduce((s, rt) => s + (auditData?.fhir[rt]?.length || 0), 0)
  const totalSynd = auditData?.syndication?.totalCount || 0

  const fhirChartData = FHIR_TYPES.map(rt => ({
    name: rt, value: auditData?.fhir[rt]?.length || 0, color: TYPE_COLORS[rt],
  }))
  const syndChartData = (auditData?.syndication?.categories || [])
    .sort((a, b) => b.count - a.count).slice(0, 8)
    .map(c => ({ name: c.term.replace(/_/g, ' '), value: c.count }))

  const TABS = [
    { id: 'overview',     label: 'Overview' },
    { id: 'fhir',         label: 'FHIR Resources' },
    { id: 'syndication',  label: 'Syndication' },
    { id: 'audit',        label: 'Audit' },
    { id: 'server',       label: 'Server' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <style>{`.refresh-btn:hover { border-color: var(--accent) !important; color: var(--accent) !important; }`}</style>

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', height: 54,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 200,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#000' }}>N</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text)' }}>NCTS Audit</div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text2)', letterSpacing: '0.08em' }}>National Clinical Terminology Service</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {lastFetched && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>Updated {lastFetched.toLocaleTimeString('en-AU')}</span>}
          {credentials?.clientId && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{credentials.clientId}</span>}
          <ExportMenu auditData={auditData} disabled={!auditData || loading} />
          <button className="refresh-btn" style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border2)', borderRadius: 2, color: 'var(--text2)', fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }} onClick={fetchAudit} disabled={loading}>
            {loading ? '…' : '↻ Refresh'}
          </button>
          <button style={{ padding: '6px 14px', background: 'transparent', border: '1px solid rgba(255,77,109,0.3)', borderRadius: 2, color: 'var(--red)', fontSize: 12, cursor: 'pointer' }} onClick={onLogout}>
            Disconnect
          </button>
        </div>
      </header>

      {/* Progress bar */}
      {loading && (
        <div style={{ height: 2, background: 'var(--border)', flexShrink: 0 }}>
          <div style={{ height: '100%', width: `${loadingProgress}%`, background: 'var(--accent)', transition: 'width 0.4s ease' }} />
        </div>
      )}

      <main style={{ flex: 1, padding: '28px 32px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 3 }}>Terminology Artefact Audit</div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            All artefacts published on the NCTS — FHIR resources and syndication releases
            {auditData?.syndication?.feedUpdated && (
              <> · Feed updated <span style={{ color: 'var(--text)' }}>{new Date(auditData.syndication.feedUpdated).toLocaleDateString('en-AU')}</span></>
            )}
          </div>
        </div>

        {/* Stat cards 3+3 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
          <StatCard label="Total Artefacts"  value={loading ? null : totalFhir + totalSynd} color="var(--accent)"   loading={loading} />
          <StatCard label="CodeSystems"       value={loading ? null : auditData?.fhir?.CodeSystem?.length}            color={TYPE_COLORS.CodeSystem}  loading={loading} />
          <StatCard label="ValueSets"         value={loading ? null : auditData?.fhir?.ValueSet?.length}              color={TYPE_COLORS.ValueSet}    loading={loading} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          <StatCard label="ConceptMaps"       value={loading ? null : auditData?.fhir?.ConceptMap?.length}            color={TYPE_COLORS.ConceptMap}  loading={loading} />
          <StatCard label="NamingSystems"     value={loading ? null : auditData?.fhir?.NamingSystem?.length}          color={TYPE_COLORS.NamingSystem} loading={loading} />
          <StatCard label="Syndication Entries" value={loading ? null : totalSynd}                                    color="var(--yellow)"           loading={loading} />
        </div>

        {/* Charts */}
        {!loading && auditData && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, padding: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>FHIR Resources by Type</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={fhirChartData} barSize={28}>
                  <XAxis dataKey="name" tick={{ fill: 'var(--text2)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text2)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" radius={[2, 2, 0, 0]}>{fhirChartData.map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, padding: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Syndication Categories (top 8)</div>
              {syndChartData.length > 0
                ? <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={syndChartData} layout="vertical" barSize={12}>
                      <XAxis type="number" tick={{ fill: 'var(--text2)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'var(--text2)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="value" fill="var(--yellow)" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                : <div style={{ color: 'var(--text2)', fontSize: 12, padding: 20 }}>No syndication data</div>
              }
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 3, color: 'var(--red)', fontSize: 12, marginBottom: 20 }}>
            ⚠ {error}
          </div>
        )}

        {/* Tab section */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  style={{
                    padding: '11px 20px', fontSize: 12, fontWeight: 600,
                    background: 'transparent', border: 'none',
                    color: activeTab === tab.id ? 'var(--text)' : 'var(--text2)',
                    cursor: 'pointer',
                    borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                    transition: 'all 0.15s', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                  }}
                  onClick={() => setActiveTab(tab.id)}
                  onMouseOver={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--text)' }}
                  onMouseOut={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--text2)' }}
                >
                  {tab.label}
                  {auditData && tab.id === 'fhir'        && <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', opacity: 0.8 }}>{totalFhir}</span>}
                  {auditData && tab.id === 'syndication'  && <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--yellow)', opacity: 0.8 }}>{totalSynd}</span>}
                  {tab.id === 'audit' && <span style={{ marginLeft: 6, fontSize: 9, fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 2, background: 'rgba(255,77,109,0.15)', color: 'var(--red)', verticalAlign: 'middle' }}>NEW</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, flexDirection: 'column', gap: 16 }}>
              <div style={{ width: 32, height: 32, border: '2px solid var(--border2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{loadingStage}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{loadingProgress}%</div>
            </div>
          ) : activeTab === 'overview' ? (
            <OverviewTab auditData={auditData} />
          ) : activeTab === 'fhir' ? (
            <div>
              <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: '0 20px', overflowX: 'auto' }}>
                {FHIR_TYPES.map(rt => (
                  <button key={rt} onClick={() => setActiveFhirType(rt)} style={{
                    padding: '10px 16px', background: 'transparent', border: 'none',
                    borderBottom: `2px solid ${activeFhirType === rt ? TYPE_COLORS[rt] : 'transparent'}`,
                    color: activeFhirType === rt ? 'var(--text)' : 'var(--text2)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}>
                    {rt}
                    <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: TYPE_COLORS[rt] }}>{auditData?.fhir[rt]?.length ?? 0}</span>
                  </button>
                ))}
              </div>
              <FhirTable resources={auditData?.fhir[activeFhirType] || []} resourceType={activeFhirType} color={TYPE_COLORS[activeFhirType]} />
            </div>
          ) : activeTab === 'syndication' ? (
            <div>
              {auditData?.syndication
                ? <SyndicationTable data={auditData.syndication} />
                : <div style={{ padding: 24, color: 'var(--text2)', fontSize: 13 }}>No syndication data available.</div>
              }
            </div>
          ) : activeTab === 'audit' ? (
            <AuditTab auditData={auditData} />
          ) : (
            <ServerTab auditData={auditData} />
          )}
        </div>
      </main>

      <footer style={{ padding: '14px 32px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>NCTS Audit · Australian Digital Health Agency</span>
        <a href="https://www.healthterminologies.gov.au" target="_blank" rel="noreferrer" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)', textDecoration: 'none' }}>healthterminologies.gov.au</a>
      </footer>
    </div>
  )
}
