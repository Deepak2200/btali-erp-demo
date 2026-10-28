// Business-aware widgets shared by all modules.
import React, { useMemo, useRef, useState } from 'react'
import { Plus, Trash2, ScanLine, Printer, Zap } from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import { useStore, useLookup } from '../store'
import { Button, IconButton, Combobox, NumberInput, ProductImage, cx, Input, Badge } from './ui'
import { fmtINR, fmtMoney, fmtNum, fmtCompact, round2, sum, fmtDate } from '../lib/format'
import { quotePrice } from '../lib/pricing'

export const CHART_COLORS = ['#f2541f', '#2f416b', '#0d9488', '#f59e0b', '#7c3aed', '#0284c7', '#64748b', '#db2777']

// ------------------------------------------------------------------ cells
export function ProductCell({ id, product: p0, sub, size = 'sm' }) {
  const { product } = useLookup()
  const p = p0 || product(id)
  if (!p) return <span className="text-slate-400">—</span>
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <ProductImage product={p} size={size === 'xs' ? 'xs' : 'sm'} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{p.shortName || p.name}</div>
        <div className="text-[11px] text-slate-500 truncate">{p.sku}{sub ? ` · ${sub}` : ''}</div>
      </div>
    </div>
  )
}
export function PartnerCell({ id, sub }) {
  const { partner } = useLookup()
  const p = partner(id)
  if (!p) return <span className="text-slate-400">—</span>
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
      <div className="text-[11px] text-slate-500 truncate">{sub ?? `${p.city}${p.region ? ` · ${p.region}` : ''}`}</div>
    </div>
  )
}
export function VendorName({ id }) {
  const { vendor } = useLookup()
  return <>{vendor(id)?.name || '—'}</>
}
export function UserName({ id, fallback = '—' }) {
  const { user } = useLookup()
  return <>{user(id)?.name || fallback}</>
}
export const Money = ({ v, currency = 'INR', className }) => <span className={cx('tabular-nums', className)}>{fmtMoney(v, currency)}</span>

// ------------------------------------------------------------------ line items editor
/**
 * mode: 'vendor' (rate = vendor rate, currency from vendor), 'dealer' (price from pricing engine for partnerId), 'manual'
 * lines: [{productId, qty, rate|price}]
 */
export function LineItemsEditor({ lines, onChange, mode = 'dealer', partnerId, vendorId, currency = 'INR', productFilter, readOnly, allowPriceEdit = false, showStock = false }) {
  const state = useStore()
  const products = useMemo(() => state.products.filter((p) => p.active && (!productFilter || productFilter(p)) && (mode !== 'vendor' || !vendorId || p.vendorIds.includes(vendorId))), [state.products, productFilter, mode, vendorId])
  const options = products.map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: `${p.category} · MRP ${fmtINR(p.mrp)}` }))
  const priceOf = (l) => {
    if (mode === 'vendor') return l.rate ?? state.products.find((p) => p.id === l.productId)?.vendorRate ?? 0
    if (mode === 'dealer') return l.price ?? (l.productId ? quotePrice(state, { productId: l.productId, partnerId, qty: l.qty || 1 }).unitPrice : 0)
    return l.price ?? 0
  }
  const update = (i, patch) => {
    const next = lines.map((l, j) => (j === i ? { ...l, ...patch } : l))
    if (mode === 'dealer' && (patch.productId || patch.qty != null) && !allowPriceEdit) {
      const l = next[i]
      if (l.productId) next[i] = { ...l, price: quotePrice(state, { productId: l.productId, partnerId, qty: l.qty || 1 }).unitPrice }
    }
    if (mode === 'vendor' && patch.productId) next[i] = { ...next[i], rate: state.products.find((p) => p.id === patch.productId)?.vendorRate }
    onChange(next)
  }
  const total = sum(lines, (l) => (Number(l.qty) || 0) * (priceOf(l) || 0))
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 min-w-[240px]">Product</th>
              {showStock && <th className="text-right px-3 py-2">On hand</th>}
              <th className="text-right px-3 py-2 w-28">Qty</th>
              <th className="text-right px-3 py-2 w-36">{mode === 'vendor' ? `Rate (${currency})` : 'Unit price'}</th>
              <th className="text-right px-3 py-2 w-36">Amount</th>
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l, i) => {
              const p = state.products.find((x) => x.id === l.productId)
              const price = priceOf(l)
              return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    {readOnly ? <ProductCell id={l.productId} /> : <Combobox options={options} value={l.productId} onChange={(v) => update(i, { productId: v })} placeholder="Select product…" />}
                    {p && mode === 'vendor' && <div className="text-[11px] text-slate-400 mt-1">MOQ {p.moq} · MRP {fmtINR(p.mrp)}</div>}
                  </td>
                  {showStock && <td className="px-3 py-2 text-right tabular-nums text-slate-600">{p ? fmtNum(state.stock['WH-BTALI']?.[p.id] || 0) : '—'}</td>}
                  <td className="px-3 py-2 text-right">
                    {readOnly ? fmtNum(l.qty) : <NumberInput min={0} value={l.qty} onChange={(v) => update(i, { qty: v })} className="text-right" />}
                    {p && mode === 'vendor' && l.qty > 0 && l.qty < p.moq && <div className="text-[10px] text-amber-600 mt-0.5">Below MOQ</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {readOnly || (mode === 'dealer' && !allowPriceEdit) ? <span className="tabular-nums">{fmtMoney(price, mode === 'vendor' ? currency : 'INR')}</span>
                      : <NumberInput min={0} step="0.01" value={mode === 'vendor' ? l.rate : l.price} onChange={(v) => update(i, mode === 'vendor' ? { rate: v } : { price: v })} className="text-right" />}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(round2((Number(l.qty) || 0) * (price || 0)), mode === 'vendor' ? currency : 'INR')}</td>
                  {!readOnly && <td className="px-1"><IconButton icon={Trash2} tone="danger" title="Remove line" onClick={() => onChange(lines.filter((_, j) => j !== i))} /></td>}
                </tr>
              )
            })}
            {lines.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6 text-sm">No items yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-200">
        {!readOnly ? <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...lines, { productId: '', qty: 1 }])}>Add line</Button> : <span />}
        <div className="text-sm"><span className="text-slate-500 mr-2">Total</span><span className="font-bold tabular-nums">{fmtMoney(total, mode === 'vendor' ? currency : 'INR')}</span></div>
      </div>
    </div>
  )
}

/** Read-only lines with GST summary */
export function OrderLines({ lines, subtotal, gst, total, currency = 'INR', showDiscount = true }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Product</th>
              <th className="text-right px-3 py-2">Qty</th>
              {showDiscount && <th className="text-right px-3 py-2">MRP</th>}
              {showDiscount && <th className="text-right px-3 py-2">Disc.</th>}
              <th className="text-right px-3 py-2">Rate</th>
              <th className="text-right px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2"><ProductCell id={l.productId} sub={l.free ? 'FREE (scheme)' : undefined} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td>
                {showDiscount && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{l.mrp ? fmtINR(l.mrp) : '—'}</td>}
                {showDiscount && <td className="px-3 py-2 text-right tabular-nums text-slate-500" title={(l.discounts || []).map((d) => `${d.label}${d.pct ? ` ${d.pct}%` : ''}`).join('\n')}>{l.discountPct ? `${l.discountPct}%` : '—'}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.price ?? l.rate, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(l.amount ?? l.qty * (l.price ?? l.rate), currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {subtotal != null && (
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm space-y-1">
          <div className="flex justify-end gap-6"><span className="text-slate-500">Taxable value</span><span className="tabular-nums w-32 text-right">{fmtMoney(subtotal, currency)}</span></div>
          {gst != null && <div className="flex justify-end gap-6"><span className="text-slate-500">GST @18%</span><span className="tabular-nums w-32 text-right">{fmtMoney(gst, currency)}</span></div>}
          <div className="flex justify-end gap-6 font-bold"><span>Total</span><span className="tabular-nums w-32 text-right">{fmtMoney(total, currency)}</span></div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ barcode scan input
/** Works with USB/Bluetooth scanners (they type + Enter) and offers "simulate scan" for demos. */
export function ScanInput({ onScan, placeholder = 'Scan or type barcode and press Enter', suggestions = [], autoFocus = true, className }) {
  const [v, setV] = useState('')
  const ref = useRef(null)
  const submit = (code) => {
    const c = String(code || v).trim().toUpperCase()
    if (!c) return
    onScan(c)
    setV('')
    ref.current?.focus()
  }
  return (
    <div className={cx('flex flex-wrap gap-2', className)}>
      <div className="relative flex-1 min-w-[200px]">
        <ScanLine className="w-4 h-4 text-brand-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input ref={ref} autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={placeholder} className="pl-9 font-mono" />
      </div>
      <Button variant="secondary" onClick={() => submit()}>Add</Button>
      {suggestions.length > 0 && (
        <Button variant="soft" icon={Zap} title="Simulate a scanner read" onClick={() => submit(suggestions[Math.floor(Math.random() * suggestions.length)])}>Simulate scan</Button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ printable document
export function PrintArea({ children, title = 'Document' }) {
  const ref = useRef(null)
  const print = () => {
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) return
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('')
    w.document.write(`<!doctype html><html><head><title>${title}</title>${styles}<style>body{background:#fff;padding:24px} .no-print{display:none!important}</style></head><body>${ref.current.innerHTML}</body></html>`)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 400)
  }
  return (
    <div>
      <div className="flex justify-end mb-2 no-print"><Button variant="secondary" size="sm" icon={Printer} onClick={print}>Print / Save PDF</Button></div>
      <div ref={ref} className="bg-white border border-slate-200 rounded-xl p-6">{children}</div>
    </div>
  )
}
/** Standard Btali document header for invoices / POs / payslips */
export function DocHeader({ title, number, date, right }) {
  const company = useStore((s) => s.settings.company)
  return (
    <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-slate-200 pb-4 mb-4">
      <div>
        <div className="text-2xl font-black italic tracking-tight"><span className="text-ink-900">B</span><span className="text-brand-500">TALI</span></div>
        <div className="text-xs text-slate-500 mt-1 leading-relaxed">{company.legalName}<br />{company.address}<br />GSTIN {company.gstin} · {company.email}</div>
      </div>
      <div className="sm:text-right">
        <div className="text-lg font-bold text-ink-900 uppercase tracking-wide">{title}</div>
        {number && <div className="text-sm text-slate-700 font-mono">{number}</div>}
        {date && <div className="text-xs text-slate-500">Date: {fmtDate(date)}</div>}
        {right}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ charts
const tooltipStyle = { contentStyle: { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.08)' } }
export function TrendChart({ data, xKey = 'label', series, height = 260, money = true, type = 'area' }) {
  // series: [{key, label, color?}]
  const C = type === 'line' ? LineChart : AreaChart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <C data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color || CHART_COLORS[i]} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color || CHART_COLORS[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => (money ? fmtCompact(v) : fmtNum(v))} />
        <Tooltip {...tooltipStyle} formatter={(v, n) => [money ? fmtINR(v) : fmtNum(v), series.find((s) => s.key === n)?.label || n]} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => series.find((s) => s.key === v)?.label || v} />}
        {series.map((s, i) =>
          type === 'line'
            ? <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color || CHART_COLORS[i]} strokeWidth={2} dot={false} strokeDasharray={s.dashed ? '5 4' : undefined} />
            : <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color || CHART_COLORS[i]} strokeWidth={2} fill={`url(#g-${s.key})`} />,
        )}
      </C>
    </ResponsiveContainer>
  )
}
export function BarsChart({ data, xKey = 'label', series, height = 260, money = true, layout = 'horizontal', stacked = false }) {
  const vertical = layout === 'vertical'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={vertical ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: vertical ? 8 : 0, bottom: 0 }}>
        <CartesianGrid stroke="#f1f5f9" vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => (money ? fmtCompact(v) : fmtNum(v))} />
            <YAxis type="category" dataKey={xKey} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} width={130} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => (money ? fmtCompact(v) : fmtNum(v))} />
          </>
        )}
        <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} formatter={(v, n) => [money ? fmtINR(v) : fmtNum(v), series.find((s) => s.key === n)?.label || n]} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => series.find((s) => s.key === v)?.label || v} />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId={stacked ? 'a' : undefined} fill={s.color || CHART_COLORS[i]} radius={stacked ? 0 : vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}
export function DonutChart({ data, nameKey = 'name', valueKey = 'value', height = 240, money = true }) {
  const total = sum(data, (d) => d[valueKey])
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-full sm:w-1/2" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v) => (money ? fmtINR(v) : fmtNum(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full sm:w-1/2 space-y-1.5">
        {data.map((d, i) => (
          <li key={d[nameKey]} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="flex-1 truncate text-slate-700">{d[nameKey]}</span>
            <span className="tabular-nums text-slate-500 text-xs">{total ? ((d[valueKey] / total) * 100).toFixed(1) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
export function FMSBadge({ cls }) {
  if (!cls) return null
  return <Badge tone={cls === 'F' ? 'green' : cls === 'M' ? 'amber' : 'gray'}>{cls === 'F' ? 'Fast' : cls === 'M' ? 'Medium' : 'Slow'}</Badge>
}
