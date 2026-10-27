// Formatting + small shared helpers used across every module.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = new Intl.NumberFormat('en-IN')

export const fmtINR = (v, decimals = false) => (v == null || isNaN(v) ? '—' : (decimals ? inr2 : inr).format(v))
export const fmtNum = (v) => (v == null || isNaN(v) ? '—' : num.format(Math.round(v * 100) / 100))
export const fmtPct = (v, d = 1) => (v == null || isNaN(v) ? '—' : `${Number(v).toFixed(d)}%`)
export const fmtMoney = (v, currency = 'INR') => {
  if (v == null || isNaN(v)) return '—'
  if (currency === 'INR') return fmtINR(v)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v)
}
/** Compact INR, e.g. ₹12.4L, ₹3.2Cr */
export const fmtCompact = (v) => {
  if (v == null || isNaN(v)) return '—'
  const a = Math.abs(v)
  const s = v < 0 ? '-' : ''
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)}Cr`
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}K`
  return `${s}₹${Math.round(a)}`
}

// ---- dates (ISO yyyy-mm-dd strings everywhere) ----
export const today = () => new Date().toISOString().slice(0, 10)
export const nowISO = () => new Date().toISOString()
export const addDays = (iso, n) => {
  const d = new Date(iso || today())
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export const daysAgo = (n) => addDays(today(), -n)
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
export const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
export const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
export const timeAgo = (iso) => {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return fmtDate(iso)
}
export const monthKey = (iso) => (iso || '').slice(0, 7) // yyyy-mm
export const monthLabel = (key) => {
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}
/** last n month keys ending with current month, oldest first */
export const lastMonths = (n) => {
  const out = []
  const d = new Date()
  d.setDate(1)
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

// ---- misc ----
export const uid = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
export const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0)
export const groupBy = (arr, fn) =>
  arr.reduce((m, x) => {
    const k = typeof fn === 'function' ? fn(x) : x[fn]
    ;(m[k] ||= []).push(x)
    return m
  }, {})
export const byId = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]))
export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
export const titleCase = (s = '') =>
  String(s)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())

/** Download any text content as a file */
export const downloadText = (filename, content, mime = 'text/plain') => {
  const blob = new Blob([content], { type: mime })
  downloadBlob(filename, blob)
}
export const downloadBlob = (filename, blob) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
/** rows: array of objects, cols: [{key, header, value?:(row)=>any}] */
export const toCSV = (rows, cols) => {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = cols.map((c) => esc(c.header ?? c.key)).join(',')
  const body = rows.map((r) => cols.map((c) => esc(c.value ? c.value(r) : r[c.key])).join(',')).join('\n')
  return `${head}\n${body}`
}
export const exportCSV = (filename, rows, cols) => downloadText(filename, toCSV(rows, cols), 'text/csv')

/** Parse simple CSV (handles quotes) -> array of objects keyed by header */
export const parseCSV = (text) => {
  const rows = []
  let cur = [''], inQ = false, row = []
  const lines = []
  let field = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      lines.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); lines.push(row) }
  void cur
  const clean = lines.filter((l) => l.some((x) => x.trim() !== ''))
  if (!clean.length) return rows
  const head = clean[0].map((h) => h.trim())
  for (const l of clean.slice(1)) rows.push(Object.fromEntries(head.map((h, i) => [h, (l[i] ?? '').trim()])))
  return rows
}

/** Read a File into an attachment object. Small files keep a dataURL so they survive reloads. */
const memoryUrls = new Map()
export const fileToAttachment = (file, extra = {}) =>
  new Promise((resolve) => {
    const base = {
      id: uid('att'),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      uploadedAt: nowISO(),
      ...extra,
    }
    if (file.size <= 350 * 1024) {
      const r = new FileReader()
      r.onload = () => resolve({ ...base, url: r.result })
      r.onerror = () => resolve(base)
      r.readAsDataURL(file)
    } else {
      const url = URL.createObjectURL(file)
      memoryUrls.set(base.id, url)
      resolve({ ...base, url, transient: true })
    }
  })
/** A generated attachment (e.g. system-made PDF/label) */
export const makeAttachment = (name, extra = {}) => ({
  id: uid('att'),
  name,
  size: 24000 + Math.floor(Math.random() * 180000),
  type: name.endsWith('.pdf') ? 'application/pdf' : name.match(/\.(png|jpg|jpeg)$/) ? 'image/png' : name.match(/\.(mp4|mov)$/) ? 'video/mp4' : 'application/octet-stream',
  uploadedAt: nowISO(),
  ...extra,
})
export const fmtSize = (b) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** Deterministic PRNG for seed data */
export const mulberry32 = (a) => () => {
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
