import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ShoppingCart, AlertTriangle, Boxes, Clock, Plus, RotateCcw, Download } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, Grid, Stat, Combobox, Segmented, SearchInput, ProductImage, Alert, EmptyState, toast, cx } from '../../components/ui'
import { fmtINR, fmtNum, fmtDate, sum, daysBetween, today, exportCSV, daysAgo } from '../../lib/format'
import { quotePrice } from '../../lib/pricing'
import { usePortal, usePricingState } from './_portal'

export default function Stock() {
  const nav = useNavigate()
  const { partnerId, partner, base, isFranchise } = usePortal()
  const pstate = usePricingState()
  const units = useStore((s) => s.units)
  const invoices = useStore((s) => s.invoices)
  const posOrders = useStore((s) => s.posOrders)
  const save = useStore((s) => s.updatePartnerStockLevels)
  const addLinesToCart = useStore((s) => s.addLinesToCart)
  const [edit, setEdit] = useState({})
  const [extra, setExtra] = useState([])
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  useEffect(() => { setEdit({}); setExtra([]) }, [partnerId])

  const stock = partner?.stock || {}
  const mins = partner?.stockMin || {}
  const ids = [...new Set([...Object.keys(stock), ...Object.keys(mins), ...extra])]
  const since = daysAgo(30)
  const purchased30 = useMemo(() => {
    const m = {}
    for (const i of invoices.filter((x) => x.partnerId === partnerId && x.date >= since)) for (const l of i.lines) m[l.productId] = (m[l.productId] || 0) + l.qty
    return m
  }, [invoices, partnerId, since])
  const sold30 = useMemo(() => {
    const m = {}
    for (const o of (posOrders || []).filter((x) => x.partnerId === partnerId && x.date >= since)) for (const l of o.lines) m[l.productId] = (m[l.productId] || 0) + l.qty
    return m
  }, [posOrders, partnerId, since])
  const barcoded = useMemo(() => {
    const m = {}
    for (const u of units) if (u.partnerId === partnerId && u.status === 'AT_PARTNER') m[u.productId] = (m[u.productId] || 0) + 1
    return m
  }, [units, partnerId])

  const rows = ids.map((pid) => {
    const p = pstate.products.find((x) => x.id === pid)
    if (!p) return null
    const qty = edit[pid]?.qty ?? stock[pid] ?? 0
    const min = edit[pid]?.min ?? mins[pid] ?? (p.type === 'SPARE' ? 10 : 2)
    const net = quotePrice(pstate, { productId: pid, partnerId, qty: 1 }).unitPrice
    const flag = qty === 0 ? 'OUT' : qty < min ? 'LOW' : 'OK'
    return { p, qty, min, net, value: qty * net, flag, purchased: purchased30[pid] || 0, sold: sold30[pid] || 0, barcoded: barcoded[pid] || 0, suggest: Math.max(0, min * 2 - qty) }
  }).filter(Boolean)
    .filter((r) => filter === 'all' || (filter === 'low' ? r.flag !== 'OK' : r.flag === 'OK'))
    .filter((r) => !q || `${r.p.name} ${r.p.sku}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.flag === b.flag ? a.p.category.localeCompare(b.p.category) : a.flag === 'OUT' ? -1 : b.flag === 'OUT' ? 1 : a.flag === 'LOW' ? -1 : 1))

  const all = ids.map((pid) => ({ pid, qty: stock[pid] || 0, min: mins[pid] || 0 }))
  const lowCount = all.filter((x) => x.qty < x.min).length
  const dirty = Object.keys(edit).length > 0 || extra.length > 0
  const lag = partner?.stockUpdatedAt ? daysBetween(partner.stockUpdatedAt, today()) : null

  const set = (pid, k, v) => setEdit((s) => ({ ...s, [pid]: { ...(s[pid] || {}), [k]: v === '' ? 0 : Number(v) } }))
  const doSave = () => {
    const st = {}, mn = {}
    for (const [pid, v] of Object.entries(edit)) { if (v.qty != null) st[pid] = v.qty; if (v.min != null) mn[pid] = v.min }
    for (const pid of extra) { if (st[pid] == null) st[pid] = stock[pid] || 0; if (mn[pid] == null) mn[pid] = mins[pid] ?? 2 }
    save(partnerId, { stock: st, stockMin: mn })
    setEdit({}); setExtra([])
    toast.success('Stock updated', `${Object.keys(st).length || 'All'} item(s) saved · Btali Sales can now see your latest position`)
  }
  const confirmAll = () => { save(partnerId, { stock: {}, stockMin: {} }); toast.success('Stock position confirmed', `Marked as verified on ${fmtDate(today())}`) }
  const reorder = () => {
    const lines = ids.map((pid) => ({ productId: pid, qty: Math.max(0, (mins[pid] || 0) * 2 - (stock[pid] || 0)), low: (stock[pid] || 0) < (mins[pid] || 0) })).filter((l) => l.low && l.qty > 0)
    if (!lines.length) return toast.info('No low-stock items', 'All products are above minimum')
    addLinesToCart(partnerId, lines)
    toast.success('Reorder added to cart', `${lines.length} products topped up to 2× minimum`)
    nav(`${base}/cart`)
  }
  const options = pstate.products.filter((p) => p.active && !ids.includes(p.id)).map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: p.category }))

  return (
    <div>
      <PageHeader title={isFranchise ? 'Store stock' : 'My stock'} subtitle={`Report your Btali stock so we can plan replenishment · last updated ${partner?.stockUpdatedAt ? fmtDate(partner.stockUpdatedAt) : 'never'}`}
        actions={<>
          <Button variant="secondary" icon={Download} onClick={() => exportCSV(`Stock-${partner?.code}.csv`, rows, [{ header: 'SKU', value: (r) => r.p.sku }, { header: 'Product', value: (r) => r.p.shortName }, { header: 'Category', value: (r) => r.p.category }, { header: 'On hand', value: (r) => r.qty }, { header: 'Minimum', value: (r) => r.min }, { header: 'Status', value: (r) => r.flag }, { header: 'Value', value: (r) => r.value }])}>Export</Button>
          <Button variant="secondary" icon={ShoppingCart} onClick={reorder}>Reorder low stock</Button>
          <Button icon={Save} disabled={!dirty} onClick={doSave}>Save changes</Button>
        </>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={Boxes} tone="ink" label="Stocked items" value={fmtNum(all.filter((x) => x.qty > 0).length)} sub={`${fmtNum(sum(all, (x) => x.qty))} units`} />
        <Stat icon={Boxes} tone="green" label="Stock value" value={fmtINR(sum(ids, (pid) => (stock[pid] || 0) * quotePrice(pstate, { productId: pid, partnerId, qty: 1 }).unitPrice))} />
        <Stat icon={AlertTriangle} tone={lowCount ? 'red' : 'green'} label="Below minimum" value={fmtNum(lowCount)} onClick={() => setFilter('low')} />
        <Stat icon={Clock} tone={lag == null || lag > 3 ? 'amber' : 'blue'} label="Last update" value={lag == null ? 'Never' : lag === 0 ? 'Today' : `${lag} days ago`} sub={isFranchise ? 'Target: same day' : 'Weekly update recommended'} />
      </Grid>
      {lag != null && lag > 3 && <Alert tone="warn" className="mb-4" title="Your stock position is out of date" action={<Button size="sm" variant="secondary" icon={RotateCcw} onClick={confirmAll}>Confirm unchanged</Button>}>Update the quantities below or confirm that nothing has changed.</Alert>}
      <Card padded={false}>
        <div className="flex flex-col md:flex-row gap-2 p-3 border-b border-slate-100">
          <SearchInput value={q} onChange={setQ} placeholder="Search product…" className="md:max-w-xs" />
          <Segmented size="sm" value={filter} onChange={setFilter} options={[{ key: 'all', label: `All (${ids.length})` }, { key: 'low', label: `Low / out (${lowCount})` }, { key: 'ok', label: 'Healthy' }]} />
          <div className="md:ml-auto md:w-80 flex gap-2 items-center"><Plus className="w-4 h-4 text-slate-400 shrink-0" /><Combobox className="flex-1" options={options} value="" placeholder="Add a product to track…" onChange={(v) => setExtra((s) => [...s, v])} /></div>
        </div>
        {rows.length === 0 ? <EmptyState icon={Boxes} title="No products in this view" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2 min-w-[220px]">Product</th><th className="text-right px-3 py-2">In 30d</th>{isFranchise && <th className="text-right px-3 py-2">Sold 30d</th>}{isFranchise && <th className="text-right px-3 py-2">Barcoded</th>}<th className="text-center px-3 py-2 w-28">On hand</th><th className="text-center px-3 py-2 w-28">Minimum</th><th className="text-left px-3 py-2">Status</th><th className="text-right px-4 py-2">Value</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.p.id} className={cx(edit[r.p.id] && 'bg-amber-50/40')}>
                    <td className="px-4 py-2"><div className="flex items-center gap-2"><ProductImage product={r.p} size="sm" /><div className="min-w-0"><div className="font-medium text-slate-800 truncate">{r.p.shortName}</div><div className="text-[11px] text-slate-500">{r.p.sku} · {r.p.category}</div></div></div></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.purchased || '—'}</td>
                    {isFranchise && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.sold || '—'}</td>}
                    {isFranchise && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.p.type === 'FG' ? r.barcoded : '—'}</td>}
                    <td className="px-3 py-2"><input inputMode="numeric" value={r.qty} onChange={(e) => set(r.p.id, 'qty', e.target.value.replace(/\D/g, ''))} className="w-20 mx-auto block text-center rounded-lg border border-slate-300 py-1 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></td>
                    <td className="px-3 py-2"><input inputMode="numeric" value={r.min} onChange={(e) => set(r.p.id, 'min', e.target.value.replace(/\D/g, ''))} className="w-20 mx-auto block text-center rounded-lg border border-slate-200 py-1 tabular-nums text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></td>
                    <td className="px-3 py-2">{r.flag === 'OUT' ? <Badge tone="red" dot>Out of stock</Badge> : r.flag === 'LOW' ? <Badge tone="amber" dot>Low – order {r.suggest}</Badge> : <Badge tone="green" dot>OK</Badge>}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtINR(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dirty && <div className="sticky bottom-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 bg-white rounded-b-xl"><span className="text-sm text-slate-600">{Object.keys(edit).length + extra.length} unsaved change(s)</span><div className="flex gap-2"><Button variant="ghost" onClick={() => { setEdit({}); setExtra([]) }}>Discard</Button><Button icon={Save} onClick={doSave}>Save changes</Button></div></div>}
      </Card>
    </div>
  )
}
