const btn = {
  padding: '5px 12px', background: 'transparent', border: '1px solid var(--border2)',
  borderRadius: 2, color: 'var(--text2)', fontSize: 11, cursor: 'pointer',
}

export default function Pagination({ page, totalPages, total, onPageChange, accentColor = 'var(--accent)' }) {
  if (totalPages <= 1) return null

  let pages = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else if (page <= 4) {
    for (let i = 1; i <= 7; i++) pages.push(i)
  } else if (page >= totalPages - 3) {
    for (let i = totalPages - 6; i <= totalPages; i++) pages.push(i)
  } else {
    for (let i = page - 3; i <= page + 3; i++) pages.push(i)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 0', marginTop: 8, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text2)' }}>
        Page {page} of {totalPages}
        {total != null && <span style={{ color: 'var(--text3)', marginLeft: 8 }}>({total} results)</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button style={btn} onClick={() => onPageChange(1)} disabled={page === 1}>⟨⟨</button>
        <button style={btn} onClick={() => onPageChange(page - 1)} disabled={page === 1}>⟨ Prev</button>
        {pages.map(p => (
          <button
            key={p}
            style={{ ...btn, ...(p === page ? { background: 'var(--surface2)', borderColor: accentColor, color: accentColor } : {}) }}
            onClick={() => onPageChange(p)}
          >{p}</button>
        ))}
        <button style={btn} onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>Next ⟩</button>
        <button style={btn} onClick={() => onPageChange(totalPages)} disabled={page === totalPages}>⟩⟩</button>
      </div>
    </div>
  )
}
