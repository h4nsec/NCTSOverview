/**
 * Staleness utilities shared across FhirTable, AuditTab, and exports.
 *
 * Thresholds:
 *   draft  > 730d  → critical  (likely abandoned)
 *   draft  > 365d  → warning   (stale draft)
 *   draft  > 90d   → caution   (ageing draft)
 *   active > 1095d → warning   (3+ years without update)
 *   active > 730d  → caution   (2+ years)
 *   active ≤ 730d  → ok
 *   retired        → retired   (intentional, not a problem)
 *   no date        → unknown
 */

export function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

export function fmtAge(days) {
  if (days === null || days === undefined) return '—'
  if (days === 0) return 'Today'
  if (days < 30)  return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

/** Returns { level, color, bg, label } */
export function getStaleness(days, status) {
  if (days === null) {
    return { level: 'unknown', color: 'var(--text3)', bg: 'transparent', label: 'No date' }
  }
  if (status === 'retired') {
    return { level: 'retired', color: 'var(--text3)', bg: 'rgba(74,85,104,0.15)', label: 'Retired' }
  }
  if (status === 'draft') {
    if (days > 730) return { level: 'critical', color: 'var(--red)',     bg: 'rgba(255,77,109,0.12)',  label: 'Abandoned' }
    if (days > 365) return { level: 'warning',  color: 'var(--accent3)', bg: 'rgba(255,107,53,0.12)', label: 'Stale draft' }
    if (days > 90)  return { level: 'caution',  color: 'var(--yellow)',  bg: 'rgba(255,209,102,0.10)', label: 'Active draft' }
    return              { level: 'ok',       color: 'var(--green)',   bg: 'rgba(6,214,160,0.08)',  label: 'Recent' }
  }
  // active / unknown status
  if (days > 1095) return { level: 'warning', color: 'var(--accent3)', bg: 'rgba(255,107,53,0.10)', label: '3y+ stale' }
  if (days > 730)  return { level: 'caution', color: 'var(--yellow)',  bg: 'rgba(255,209,102,0.08)', label: '2y+ old' }
  return               { level: 'ok',      color: 'var(--green)',   bg: 'rgba(6,214,160,0.06)',  label: 'Current' }
}

/**
 * Known release schedules for NCTS syndication products.
 * match(categoryTerm) → bool
 * maxDays: age that triggers "due" warning; 1.5× triggers "overdue"
 */
export const RELEASE_SCHEDULES = [
  {
    name: 'SNOMED CT Australian Edition',
    match: t => /SCT/i.test(t),
    frequency: 'Every 6 months (March & September)',
    maxDays: 200,
    note: 'Aligned with SNOMED International biannual cycle',
  },
  {
    name: 'Australian Medicines Terminology (AMT)',
    match: t => /\bAMT\b/i.test(t),
    frequency: 'Monthly',
    maxDays: 45,
    note: 'Monthly releases managed by ADHA',
  },
  {
    name: 'LOINC',
    match: t => /\bLOINC\b/i.test(t),
    frequency: 'Every 6 months',
    maxDays: 200,
    note: 'Biannual releases from Regenstrief Institute',
  },
  {
    name: 'ICD-10-AM / ACHI',
    match: t => /ICD[\-_]?10|ACHI/i.test(t),
    frequency: 'Periodic (with edition updates)',
    maxDays: 730,
    note: 'AIHW release cycle',
  },
  {
    name: 'ICPC-2+',
    match: t => /ICPC/i.test(t),
    frequency: 'Periodic',
    maxDays: 730,
    note: 'International Classification of Primary Care',
  },
  {
    name: 'NCTS FHIR Bundles / Packages',
    match: t => /FHIR/i.test(t),
    frequency: 'Periodic',
    maxDays: 365,
    note: 'NCTS FHIR terminology bundles',
  },
]
