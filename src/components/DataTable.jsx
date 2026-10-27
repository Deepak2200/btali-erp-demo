import React, { useEffect, useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { cx, SearchInput, Select, EmptyState, Button, Checkbox } from './ui'
import { exportCSV } from '../lib/format'

/**
 * columns: [{ key, header, render?(row), value?(row) (for sort/search/export), align?, className?, sortable? (default true), width?, hidden? }]
 * filters: [{ key, label, options:[{value,label}] | string[], value?(row) }]
 * bulkActions: (selectedRows, clear) => ReactNode
 */
export default function DataTable({
  columns, rows, onRowClick, searchable = true, searchPlaceholder = 'Search…', filters = [], pageSize = 12, exportName, toolbar,
  bulkActions, initialSort, empty, dense, rowKey = 'id', rowClass, stickyHeader = false, className, footer,
}) {
  const [q, setQ] = useState('')
  const [fv, setFv] = useState({})
  const [sort, setSort] = useState(initialSort || null)
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState(new Set())
  const cols = columns.filter((c) => !c.hidden)
  const valOf = (c, r) => (c.value ? c.value(r) : r[c.key])

  const filtered = useMemo(() => {
    let out = rows
    for (const f of filters) {
      const v = fv[f.key]
      if (v) out = out.filter((r) => String(f.value ? f.value(r) : r[f.key]) === v)
    }
    if (q.trim()) {
      const s = q.toLowerCase()
      out = out.filter((r) => cols.some((c) => {
        const v = valOf(c, r)
        return v != null && typeof v !== 'object' && String(v).toLowerCase().includes(s)
      }))
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key)
      if (c) {
        out = [...out].sort((a, b) => {
          const va = valOf(c, a), vb = valOf(c, b)
          if (va == null) return 1
          if (vb == null) return -1
          const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })
          return sort.dir === 'asc' ? r : -r
        })
      }
    }
    return out
  }, [rows, q, fv, sort, columns]) // eslint-disable-line

  useEffect(() => setPage(0), [q, fv, rows.length])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const view = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const toggleSort = (c) => {
    if (c.sortable === false) return
    setSort((s) => (s?.key === c.key ? (s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : { key: c.key, dir: 'asc' }))
  }
  const selectedRows = rows.filter((r) => sel.has(r[rowKey]))
  const allOnPage = view.length > 0 && view.every((r) => sel.has(r[rowKey]))

  return (
    <div className={cx('bg-white rounded-xl border border-slate-200 shadow-card', className)}>
      {(searchable || filters.length || toolbar || exportName) && (
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between p-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-2 flex-1">
            {searchable && <SearchInput value={q} onChange={setQ} placeholder={searchPlaceholder} className="sm:max-w-xs w-full" />}
            {filters.map((f) => (
              <Select key={f.key} value={fv[f.key] || ''} onChange={(e) => setFv((s) => ({ ...s, [f.key]: e.target.value }))} placeholder={`All ${f.label}`}
                options={(f.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o))} className="sm:w-44" />
            ))}
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {toolbar}
            {exportName && (
              <Button variant="secondary" size="sm" icon={Download}
                onClick={() => exportCSV(`${exportName}.csv`, filtered, cols.filter((c) => c.export !== false).map((c) => ({ header: typeof c.header === 'string' ? c.header : c.key, value: (r) => { const v = valOf(c, r); return typeof v === 'object' ? '' : v } })))}>
                Export
              </Button>
            )}
          </div>
        </div>
      )}
      {bulkActions && sel.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-brand-50 border-b border-brand-100 text-sm">
          <span className="font-medium text-brand-800">{sel.size} selected</span>
          {bulkActions(selectedRows, () => setSel(new Set()))}
          <button className="text-xs text-slate-500 hover:underline ml-auto" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <div className={cx('overflow-x-auto', stickyHeader && 'max-h-[65vh] overflow-y-auto')}>
        <table className="w-full text-sm">
          <thead className={cx('bg-slate-50/80 text-slate-500', stickyHeader && 'sticky top-0 z-10')}>
            <tr>
              {bulkActions && (
                <th className="w-10 px-3 py-2.5">
                  <Checkbox checked={allOnPage} onChange={(v) => setSel((s) => { const n = new Set(s); view.forEach((r) => (v ? n.add(r[rowKey]) : n.delete(r[rowKey]))); return n })} />
                </th>
              )}
              {cols.map((c) => (
                <th key={c.key} style={{ width: c.width }} onClick={() => toggleSort(c)}
                  className={cx('px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap select-none', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left', c.sortable !== false && 'cursor-pointer hover:text-slate-800')}>
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {c.sortable !== false && (sort?.key === c.key ? (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-30" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.map((r, i) => (
              <tr key={r[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx(onRowClick && 'cursor-pointer hover:bg-brand-50/40', sel.has(r[rowKey]) && 'bg-brand-50/60', rowClass?.(r))}>
                {bulkActions && (
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.has(r[rowKey])} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(r[rowKey]) : n.delete(r[rowKey]); return n })} />
                  </td>
                )}
                {cols.map((c) => (
                  <td key={c.key} className={cx('px-3 text-slate-700', dense ? 'py-1.5' : 'py-2.5', c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : 'text-left', c.className)}>
                    {c.render ? c.render(r) : valOf(c, r) ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot className="bg-slate-50 font-semibold">{footer}</tfoot>}
        </table>
        {view.length === 0 && (empty || <EmptyState title="No records found" message={q || Object.values(fv).some(Boolean) ? 'Try changing the search or filters.' : undefined} />)}
      </div>
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 text-xs text-slate-500">
          <span>{page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-2">Page {page + 1} / {pages}</span>
            <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}
