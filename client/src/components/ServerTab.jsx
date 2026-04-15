import { useState } from 'react'

const th = {
  padding: '8px 12px', textAlign: 'left',
  fontSize: 10, fontFamily: 'var(--font-mono)',
  color: 'var(--text2)', letterSpacing: '0.06em', textTransform: 'uppercase',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const td = { padding: '9px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', fontSize: 12 }
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }

function Card({ title, badge, children }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        {badge != null && (
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 2, background: 'rgba(0,212,170,0.1)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,0.2)' }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function KV({ label, value, mono }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', gap: 16, padding: '8px 20px', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
      <div style={{ minWidth: 180, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 1 }}>
        {label}
      </div>
      <div style={{ flex: 1, fontSize: 12, color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : undefined, wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  )
}

function Pill({ text, color }) {
  return (
    <span style={{
      display: 'inline-block', margin: '2px 3px',
      padding: '2px 8px', borderRadius: 2, fontSize: 10, fontFamily: 'var(--font-mono)',
      background: color ? `${color}15` : 'var(--bg)',
      color: color || 'var(--text2)', border: `1px solid ${color ? `${color}33` : 'var(--border)'}`,
      whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

// ─── CapabilityStatement Display ──────────────────────────────────────────────

function CapabilityDisplay({ meta }) {
  const [expandedResource, setExpandedResource] = useState(null)

  const rest = meta.rest?.[0]
  const resources = rest?.resource || []
  const sysOps = rest?.operation || []

  return (
    <>
      {/* Server identity */}
      <Card title="Server Identity">
        <KV label="FHIR Version"    value={meta.fhirVersion} mono />
        <KV label="Software"        value={`${meta.software?.name || ''}${meta.software?.version ? ' v' + meta.software.version : ''}`} />
        <KV label="Implementation"  value={meta.implementation?.description || meta.implementation?.url} />
        <KV label="Publisher"       value={meta.publisher} />
        <KV label="Kind"            value={meta.kind} mono />
        <KV label="Formats"         value={<div style={{ display: 'flex', flexWrap: 'wrap' }}>{(meta.format || []).map((f, i) => <Pill key={i} text={f} />)}</div>} />
        <KV label="Patch Formats"   value={meta.patchFormat?.length ? <div>{meta.patchFormat.map((f, i) => <Pill key={i} text={f} />)}</div> : null} />
        {meta.implementation?.url && (
          <KV label="Server URL" value={
            <a href={meta.implementation.url} target="_blank" rel="noreferrer"
               style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {meta.implementation.url}
            </a>
          } />
        )}
      </Card>

      {/* System-level operations */}
      {sysOps.length > 0 && (
        <Card title="System-Level Operations" badge={`${sysOps.length} operations`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              <thead>
                <tr>
                  {['Name', 'Definition URL'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sysOps.map((op, i) => (
                  <tr key={i}
                    className="row-hover"
                  >
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                      ${op.name}
                    </td>
                    <td style={{ ...td, fontSize: 11, maxWidth: 400 }}>
                      {op.definition
                        ? <a href={op.definition} target="_blank" rel="noreferrer"
                             style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', textDecoration: 'none', wordBreak: 'break-all' }}
                             onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'}
                             onMouseOut={e => e.currentTarget.style.color = 'var(--text2)'}
                          >{op.definition}</a>
                        : <span style={{ color: 'var(--text3)' }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Supported resource types */}
      <Card title="Supported Resource Types" badge={`${resources.length} types`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tbl}>
            <thead>
              <tr>
                {['Resource Type', 'Versioning', 'Interactions', 'Search Params', 'Operations'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map((r, i) => {
                const isExpanded = expandedResource === r.type
                const interactions = (r.interaction || []).map(x => x.code)
                const ops = (r.operation || []).map(o => o.name)
                const searchCount = (r.searchParam || []).length

                return (
                  <>
                    <tr key={r.type}
                      className="row-clickable"
                      onClick={() => setExpandedResource(isExpanded ? null : r.type)}
                    >
                      <td style={{ ...td, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {r.type}
                        {r.profile && <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginTop: 2, fontWeight: 400 }}>has profile</div>}
                      </td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>
                        {r.versioning || '—'}
                      </td>
                      <td style={{ ...td, fontSize: 11 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                          {interactions.map(x => <Pill key={x} text={x} color="var(--accent)" />)}
                        </div>
                      </td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: searchCount > 0 ? 'var(--text)' : 'var(--text3)', textAlign: 'center' }}>
                        {searchCount || '—'}
                      </td>
                      <td style={{ ...td, fontSize: 11 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                          {ops.map(o => <Pill key={o} text={`$${o}`} color="var(--accent2)" />)}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && r.searchParam?.length > 0 && (
                      <tr key={r.type + '-detail'} style={{ background: 'var(--surface2)' }}>
                        <td colSpan={5} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Search Parameters ({r.searchParam.length})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {r.searchParam.map(sp => (
                              <span key={sp.name} style={{
                                fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: 2,
                                background: 'var(--bg)', border: '1px solid var(--border)',
                                color: 'var(--text2)',
                              }}>
                                {sp.name}
                                <span style={{ color: 'var(--text3)', marginLeft: 4 }}>({sp.type})</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 20px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
          Click a resource type to expand search parameters.
        </div>
      </Card>
    </>
  )
}

// ─── TerminologyCapabilities Display ─────────────────────────────────────────

function TermCapsDisplay({ tc }) {
  const codeSystems = tc.codeSystem || []

  return (
    <>
      <Card title="Terminology Operations">
        <KV label="$validate-code"  value={tc.validateCode  ? '✓ Supported' : '—'} />
        <KV label="$translate"      value={tc.translation   ? '✓ Supported' : '—'} />
        <KV label="$expand"         value={tc.expansion     ? '✓ Supported' : '—'} />
        <KV label="$closure"        value={tc.closure?.translation ? '✓ Supported' : '—'} />
        <KV label="Implicit ValueSets" value={tc.implicitValueSets || '—'} mono />
        {tc.expansion?.maxExpansionSize != null && (
          <KV label="Max Expansion Size" value={tc.expansion.maxExpansionSize.toLocaleString()} mono />
        )}
      </Card>

      {codeSystems.length > 0 && (
        <Card title="Supported Code Systems" badge={`${codeSystems.length} systems`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              <thead>
                <tr>
                  {['System URI', 'Versions', 'Subsumption', 'Content'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codeSystems.map((cs, i) => (
                  <tr key={i}
                    className="row-hover"
                  >
                    <td style={{ ...td, maxWidth: 320 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', wordBreak: 'break-all' }}>
                        {cs.uri}
                      </div>
                    </td>
                    <td style={{ ...td, fontSize: 11 }}>
                      {cs.version?.length > 0
                        ? <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {cs.version.map((v, j) => (
                              <Pill key={j} text={v.code || v.isDefault ? `${v.code || ''}${v.isDefault ? ' (default)' : ''}` : '—'} color="var(--accent)" />
                            ))}
                          </div>
                        : <span style={{ color: 'var(--text3)' }}>Any</span>
                      }
                    </td>
                    <td style={{ ...td, fontSize: 11, fontFamily: 'var(--font-mono)', color: cs.subsumption ? 'var(--green)' : 'var(--text3)' }}>
                      {cs.subsumption ? '✓ Yes' : '—'}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text2)' }}>
                      {cs.content || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

// ─── Main ServerTab ───────────────────────────────────────────────────────────

export default function ServerTab({ auditData }) {
  const [activeView, setActiveView] = useState('capability')

  const serverMeta = auditData?.serverMeta
  const termCaps   = auditData?.termCaps

  const tabs = [
    { id: 'capability', label: 'Capability Statement', available: !!serverMeta },
    { id: 'terminology', label: 'Terminology Capabilities', available: !!termCaps },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => t.available && setActiveView(t.id)}
            style={{
              padding: '7px 16px', borderRadius: 2, fontSize: 12, fontWeight: 600,
              background: activeView === t.id ? 'var(--accent)' : 'transparent',
              border: `1px solid ${activeView === t.id ? 'var(--accent)' : 'var(--border2)'}`,
              color: activeView === t.id ? '#000' : t.available ? 'var(--text2)' : 'var(--text3)',
              cursor: t.available ? 'pointer' : 'not-allowed', opacity: t.available ? 1 : 0.5,
            }}
          >
            {t.label}
            {!t.available && <span style={{ marginLeft: 6, fontSize: 10 }}>(unavailable)</span>}
          </button>
        ))}
      </div>

      {!serverMeta && !termCaps && (
        <div style={{
          padding: '24px', background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.2)',
          borderRadius: 3, fontSize: 13, color: 'var(--text2)',
        }}>
          Server metadata could not be fetched. This may be a permissions issue or the endpoint may not be available.
          Refresh to retry.
        </div>
      )}

      {activeView === 'capability' && serverMeta && <CapabilityDisplay meta={serverMeta} />}
      {activeView === 'terminology' && termCaps && <TermCapsDisplay tc={termCaps} />}
      {activeView === 'terminology' && !termCaps && (
        <div style={{ padding: '24px', color: 'var(--text2)', fontSize: 13 }}>
          TerminologyCapabilities (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>/metadata?mode=terminology</code>) was not returned by the server.
          Some FHIR servers return a CapabilityStatement even when the mode=terminology parameter is used — check the Capability Statement tab instead.
        </div>
      )}
    </div>
  )
}
