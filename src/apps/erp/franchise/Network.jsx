import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, ShoppingBag, Boxes, ShieldCheck, Send, Truck, Check, X, ScanLine, MonitorSmartphone, Clock, PackagePlus } from 'lucide-react'
import { useStore } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Badge, StatusBadge, Button, Tabs, Segmented, Switch, Progress, NumberInput, Alert, EmptyState, toast, confirm, prompt, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, DonutChart, BarsChart } from '../../../components/business'
import { salesLines, aggregate } from '../../../lib/analytics'
import { fmtINR, fmtNum, fmtDate, fmtCompact, sum, daysAgo, daysBetween, today, lastMonths, monthLabel, monthKey, round2 } from '../../../lib/format'

const lagScore = (d) => Math.max(0, 100 - (Number(d) || 0) * 12)
const complianceScore = (c = {}) => Math.round(((c.barcodeScanPct ?? 0) + (c.posUsagePct ?? 0) + lagScore(c.stockUpdateLagDays)) / 3)
const scoreTone = (v) => (v >= 90 ? 'green' : v >= 75 ? 'amber' : 'red')
const complianceIssues = (c = {}) => {
  const out = []
  if ((c.barcodeScanPct ?? 100) < 95) out.push(`Barcode scan rate ${c.barcodeScanPct}% (target 95%+)`)
  if ((c.posUsagePct ?? 100) < 95) out.push(`POS billing usage ${c.posUsagePct}% (target 95%+)`)
  if ((c.stockUpdateLagDays ?? 0) > 1) out.push(`Stock updates lagging ${c.stockUpdateLagDays} days (target same-day)`)
  return out
}
const belowMin = (p) => Object.entries(p.stockMin || {}).filter(([pid, min]) => ((p.stock || {})[pid] || 0) < min).map(([pid, min]) => ({ productId: pid, qty: (p.stock || {})[pid] || 0, min }))

export default function Network() {
  const navigate = useNavigate()
  const partners = useStore((s) => s.partners)
  const products = useStore((s) => s.products)
  const invoices = useStore((s) => s.invoices)
  const posOrders = useStore((s) => s.posOrders) || []
  const replenishments = useStore((s) => s.replenishments) || []
  const approveReplenishment = useStore((s) => s.approveReplenishment)
  const setAuto = useStore((s) => s.setFranchiseAutoReplenish)
  const updateMin = useStore((s) => s.updateFranchiseMinStock)
  const sendReminder = useStore((s) => s.sendComplianceReminder)
  const createSalesOrder = useStore((s) => s.createSalesOrder)

  const [tab, setTab] = useState('overview')
  const [storeId, setStoreId] = useState('f1')

  const stores = useMemo(() => partners.filter((p) => p.type === 'FRANCHISE'), [partners])
  const lines = useMemo(() => salesLines({ products, partners, invoices }, {}), [products, partners, invoices])
  const from30 = daysAgo(30)

  const storeStats = useMemo(() => stores.map((p) => {
    const pos = posOrders.filter((o) => o.partnerId === p.id)
    const sellIn = lines.filter((l) => l.partnerId === p.id)
    const stockUnits = sum(Object.values(p.stock || {}))
    const stockValue = sum(Object.entries(p.stock || {}), ([pid, q]) => q * (products.find((x) => x.id === pid)?.landedCost || 0))
    return {
      ...p,
      sellOut30: sum(pos.filter((o) => o.date >= from30), (o) => o.total),
      sellOutAll: sum(pos, (o) => o.total),
      bills30: pos.filter((o) => o.date >= from30).length,
      sellIn: sum(sellIn, (l) => l.revenue),
      sellIn30: sum(sellIn.filter((l) => l.date >= from30), (l) => l.revenue),
      below: belowMin(p),
      stockUnits,
      stockValue,
      score: complianceScore(p.compliance),
      issues: complianceIssues(p.compliance),
      openReq: replenishments.filter((r) => r.partnerId === p.id && ['PENDING', 'REQUESTED', 'SUBMITTED', 'PENDING_APPROVAL'].includes(r.status)).length,
    }
  }), [stores, posOrders, lines, products, replenishments, from30])

  const pendingReq = replenishments.filter((r) => ['PENDING', 'REQUESTED', 'SUBMITTED', 'PENDING_APPROVAL'].includes(r.status))

  const raiseOrder = async (store, items) => {
    if (!items.length) return toast.info('All lines are at or above minimum stock')
    const lines2 = items.map((x) => ({ productId: x.productId, qty: Math.max(x.min * 2 - x.qty, x.min) }))
    const ok = await confirm({
      title: `Create replenishment order for ${store.name}?`,
      message: `${lines2.length} line(s), ${fmtNum(sum(lines2, (l) => l.qty))} units – topping each item up to 2× its minimum level. A confirmed sales order will be created at franchise transfer prices.`,
      confirmText: 'Create order',
    })
    if (!ok) return
    const so = createSalesOrder({ partnerId: store.id, lines: lines2, source: 'SALES', note: 'Franchise replenishment (stock below minimum)' })
    toast.success(`Replenishment order ${so.number} created`, `${store.name} · ${fmtINR(so.total)}`)
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'stock', label: 'Stock vs Min', count: sum(storeStats, (s) => s.below.length) },
    { key: 'compliance', label: 'Compliance', count: storeStats.filter((s) => s.issues.length).length },
    { key: 'replenish', label: 'Replenishment', count: pendingReq.length },
    { key: 'mix', label: 'Revenue Mix' },
  ]

  return (
    <div>
      <PageHeader title="Franchise Network" subtitle="Btali company stores – sell-in, sell-out, stock discipline and mandatory process compliance" />
      <Grid cols={4} className="mb-4">
        <Stat icon={Store} label="Active stores" value={stores.filter((s) => s.status === 'ACTIVE').length} sub={`${stores.filter((s) => s.autoReplenish).length} on auto-replenishment`} />
        <Stat icon={ShoppingBag} tone="green" label="Sell-out (30 days)" value={fmtCompact(sum(storeStats, (s) => s.sellOut30))} sub={`${sum(storeStats, (s) => s.bills30)} POS bills`} />
        <Stat icon={Truck} tone="ink" label="Sell-in to stores (30 days)" value={fmtCompact(sum(storeStats, (s) => s.sellIn30))} sub={`${fmtCompact(sum(storeStats, (s) => s.sellIn))} all time`} />
        <Stat icon={ShieldCheck} tone={scoreTone(sum(storeStats, (s) => s.score) / (storeStats.length || 1)) === 'green' ? 'green' : 'amber'} label="Avg compliance score" value={`${Math.round(sum(storeStats, (s) => s.score) / (storeStats.length || 1))}%`} sub={`${sum(storeStats, (s) => s.below.length)} stock lines below min`} />
      </Grid>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {storeStats.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-ink-900 truncate">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.code} · {s.city}, {s.state} · {s.contact}</div>
                </div>
                <Badge tone={scoreTone(s.score)}>{s.score}% compliant</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <Mini label="Sell-out 30d" value={fmtCompact(s.sellOut30)} />
                <Mini label="Sell-in 30d" value={fmtCompact(s.sellIn30)} />
                <Mini label="Stock value" value={fmtCompact(s.stockValue)} sub={`${fmtNum(s.stockUnits)} units`} />
                <Mini label="Below min" value={s.below.length} tone={s.below.length ? 'text-red-600' : ''} />
              </div>
              <div className="mt-4 space-y-2">
                <ScoreRow icon={ScanLine} label="Barcode scan" v={s.compliance?.barcodeScanPct ?? 0} />
                <ScoreRow icon={MonitorSmartphone} label="POS usage" v={s.compliance?.posUsagePct ?? 0} />
                <ScoreRow icon={Clock} label="Stock update" v={lagScore(s.compliance?.stockUpdateLagDays)} text={`${s.compliance?.stockUpdateLagDays ?? 0} d lag`} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
                <Switch checked={!!s.autoReplenish} onChange={(v) => { setAuto(s.id, v); toast.success(`Auto-replenishment ${v ? 'enabled' : 'disabled'}`, s.name) }} label="Auto-replenish" />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={Boxes} onClick={() => { setStoreId(s.id); setTab('stock') }}>Stock</Button>
                  {s.below.length > 0 && <Button size="sm" variant="soft" icon={PackagePlus} onClick={() => raiseOrder(s, s.below)}>Replenish</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'stock' && <StockTab stores={storeStats} storeId={storeId} setStoreId={setStoreId} products={products} updateMin={updateMin} raiseOrder={raiseOrder} />}

      {tab === 'compliance' && (
        <div className="space-y-4">
          <Alert tone="info" title="Franchise stores follow mandatory process compliance">Barcode scanning at inward and sale, POS billing for every sale and same-day stock updates. Dealers follow these optionally.</Alert>
          <DataTable
            rows={storeStats}
            searchable={false}
            exportName="Franchise-Compliance"
            columns={[
              { key: 'name', header: 'Store', render: (r) => <div><div className="font-medium text-slate-800">{r.name}</div><div className="text-[11px] text-slate-500">{r.city}</div></div> },
              { key: 'scan', header: 'Barcode scan %', value: (r) => r.compliance?.barcodeScanPct, render: (r) => <PctCell v={r.compliance?.barcodeScanPct} /> },
              { key: 'pos', header: 'POS usage %', value: (r) => r.compliance?.posUsagePct, render: (r) => <PctCell v={r.compliance?.posUsagePct} /> },
              { key: 'lag', header: 'Stock update lag', align: 'right', value: (r) => r.compliance?.stockUpdateLagDays, render: (r) => <span className={cx((r.compliance?.stockUpdateLagDays || 0) > 1 && 'text-red-600 font-semibold')}>{r.compliance?.stockUpdateLagDays ?? 0} d</span> },
              { key: 'upd', header: 'Last stock update', value: (r) => r.stockUpdatedAt, render: (r) => (r.stockUpdatedAt ? fmtDate(r.stockUpdatedAt) : '—') },
              { key: 'score', header: 'Score', align: 'right', value: (r) => r.score, render: (r) => <Badge tone={scoreTone(r.score)}>{r.score}%</Badge> },
              { key: 'issues', header: 'Gaps', sortable: false, value: (r) => r.issues.join('; '), render: (r) => (r.issues.length ? <ul className="text-xs text-slate-600 list-disc pl-4">{r.issues.map((i) => <li key={i}>{i}</li>)}</ul> : <span className="text-xs text-emerald-600 font-medium">All processes on track</span>) },
              { key: 'act', header: '', sortable: false, export: false, render: (r) => <Button size="sm" variant={r.issues.length ? 'primary' : 'secondary'} icon={Send} onClick={() => { sendReminder(r.id, r.issues); toast.success('Reminder sent', `${r.name} – email and portal notification`) }}>Send reminder</Button> },
            ]}
          />
        </div>
      )}

      {tab === 'replenish' && <ReplenishTab rows={replenishments} stores={storeStats} products={products} approve={approveReplenishment} navigate={navigate} raiseOrder={raiseOrder} />}

      {tab === 'mix' && <MixTab lines={lines} posOrders={posOrders} stores={storeStats} />}
    </div>
  )
}

function Mini({ label, value, sub, tone }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={cx('text-base font-bold text-ink-900 tabular-nums', tone)}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  )
}
function ScoreRow({ icon: I, label, v, text }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <I className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span className="w-24 text-slate-600 shrink-0">{label}</span>
      <Progress value={v} tone={v >= 90 ? 'green' : v >= 75 ? 'amber' : 'red'} className="flex-1" />
      <span className="w-14 text-right tabular-nums text-slate-700">{text || `${v}%`}</span>
    </div>
  )
}
function PctCell({ v = 0 }) {
  return <div className="flex items-center gap-2 min-w-[140px]"><Progress value={v} tone={v >= 95 ? 'green' : v >= 80 ? 'amber' : 'red'} className="flex-1" /><span className="tabular-nums text-xs w-9 text-right">{v}%</span></div>
}

function StockTab({ stores, storeId, setStoreId, products, updateMin, raiseOrder }) {
  const store = stores.find((s) => s.id === storeId) || stores[0]
  const [onlyBelow, setOnlyBelow] = useState(false)
  if (!store) return <Card><EmptyState title="No franchise stores" /></Card>
  const ids = [...new Set([...Object.keys(store.stock || {}), ...Object.keys(store.stockMin || {})])]
  const rows = ids.map((pid) => {
    const p = products.find((x) => x.id === pid)
    const qty = (store.stock || {})[pid] || 0
    const min = (store.stockMin || {})[pid] ?? 0
    return { id: pid, product: p, sku: p?.sku, name: p?.shortName, category: p?.category, qty, min, status: qty <= 0 ? 'OUT' : qty < min ? 'LOW' : 'OK', suggest: qty < min ? Math.max(min * 2 - qty, min) : 0, value: qty * (p?.landedCost || 0) }
  }).filter((r) => r.product && (!onlyBelow || r.status !== 'OK'))
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="overflow-x-auto no-scrollbar">
          <Segmented value={store.id} onChange={setStoreId} options={stores.map((s) => ({ key: s.id, label: s.city }))} />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Switch checked={onlyBelow} onChange={setOnlyBelow} label="Only below minimum" />
          <Button icon={PackagePlus} disabled={!store.below.length} onClick={() => raiseOrder(store, store.below)}>Replenish {store.below.length} line{store.below.length === 1 ? "" : "s"}</Button>
        </div>
      </div>
      <DataTable
        rows={rows}
        exportName={`Stock-${store.code}`}
        initialSort={{ key: 'status', dir: 'asc' }}
        filters={[{ key: 'category', label: 'categories', options: [...new Set(rows.map((r) => r.category))] }]}
        columns={[
          { key: 'name', header: 'Product', render: (r) => <ProductCell product={r.product} /> },
          { key: 'category', header: 'Category' },
          { key: 'qty', header: 'On hand', align: 'right', render: (r) => <span className={cx(r.status !== 'OK' && 'text-red-600 font-semibold')}>{fmtNum(r.qty)}</span> },
          { key: 'min', header: 'Min level', align: 'right', render: (r) => <MinEditor key={`${store.id}-${r.id}-${r.min}`} value={r.min} onSave={(v) => { updateMin(store.id, r.id, v); toast.success('Minimum level updated', `${r.name}: ${v}`) }} /> },
          { key: 'status', header: 'Status', value: (r) => ({ OUT: 0, LOW: 1, OK: 2 }[r.status]), render: (r) => <Badge tone={r.status === 'OK' ? 'green' : r.status === 'LOW' ? 'amber' : 'red'} dot>{r.status === 'OK' ? 'Healthy' : r.status === 'LOW' ? 'Below min' : 'Out of stock'}</Badge> },
          { key: 'suggest', header: 'Suggested top-up', align: 'right', render: (r) => (r.suggest ? fmtNum(r.suggest) : '—') },
          { key: 'value', header: 'Stock value', align: 'right', render: (r) => fmtINR(r.value) },
        ]}
      />
      <div className="text-xs text-slate-500">Last stock update from store: {store.stockUpdatedAt ? fmtDate(store.stockUpdatedAt) : '—'} · Auto-replenishment {store.autoReplenish ? 'on – the store raises requests automatically when items fall below minimum' : 'off'}</div>
    </div>
  )
}
function MinEditor({ value, onSave }) {
  const [v, setV] = useState(value)
  return (
    <div className="flex justify-end">
      <NumberInput min={0} value={v} onChange={setV} onBlur={() => v !== value && v !== '' && onSave(v)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-20 text-right py-1" />
    </div>
  )
}

function ReplenishTab({ rows, stores, products, approve, navigate, raiseOrder }) {
  const pname = (id) => products.find((p) => p.id === id)?.shortName || id
  const sname = (id) => stores.find((s) => s.id === id)?.name || id
  const pending = (r) => ['PENDING', 'REQUESTED', 'SUBMITTED', 'PENDING_APPROVAL'].includes(r.status)
  const decide = async (r, ok) => {
    let remark = ''
    if (!ok) {
      remark = await prompt({ title: `Reject ${r.number || 'request'}?`, label: 'Reason', required: true, tone: 'danger', confirmText: 'Reject' })
      if (remark == null) return
    }
    approve(r.id, ok, remark)
    toast.success(ok ? 'Replenishment approved' : 'Replenishment rejected', `${r.number || ''} · ${sname(r.partnerId)}`)
  }
  const suggestions = stores.filter((s) => s.below.length)
  return (
    <div className="space-y-4">
      {!approve && rows.length > 0 && <Alert tone="info" title="Requests are converted to sales orders">Open the request's store and create a sales order to fulfil it.</Alert>}
      <DataTable
        rows={rows}
        exportName="Franchise-Replenishments"
        initialSort={{ key: 'date', dir: 'desc' }}
        filters={[{ key: 'status', label: 'statuses', options: [...new Set(rows.map((r) => r.status))].filter(Boolean) }, { key: 'partnerId', label: 'stores', options: stores.map((s) => ({ value: s.id, label: s.city })) }]}
        empty={<EmptyState icon={Truck} title="No replenishment requests" message="Requests raised by stores (manually or by auto-replenishment) appear here." />}
        columns={[
          { key: 'number', header: 'Request', render: (r) => <div><div className="font-medium">{r.number || r.id}</div>{r.auto && <Badge tone="violet">Auto</Badge>}</div> },
          { key: 'partnerId', header: 'Store', value: (r) => sname(r.partnerId) },
          { key: 'date', header: 'Date', value: (r) => r.date || r.createdAt || r.requestedAt, render: (r) => fmtDate(r.date || r.createdAt || r.requestedAt) },
          { key: 'lines', header: 'Items', sortable: false, value: (r) => (r.lines || []).map((l) => `${pname(l.productId)} × ${l.qty}`).join('; '), render: (r) => <div className="text-xs text-slate-600 max-w-[320px]">{(r.lines || []).slice(0, 3).map((l) => `${pname(l.productId)} × ${l.qty}`).join(', ')}{(r.lines || []).length > 3 ? ` +${r.lines.length - 3} more` : ''}</div> },
          { key: 'units', header: 'Units', align: 'right', value: (r) => sum(r.lines || [], (l) => l.qty) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'act', header: '', sortable: false, export: false, render: (r) => (pending(r) && approve ? (
            <div className="flex gap-1.5 justify-end">
              <Button size="sm" variant="success" icon={Check} onClick={() => decide(r, true)}>Approve</Button>
              <Button size="sm" variant="secondary" icon={X} onClick={() => decide(r, false)}>Reject</Button>
            </div>
          ) : r.soId ? <Button size="sm" variant="link" onClick={() => navigate(`/erp/sales/orders/${r.soId}`)}>View order</Button>
            : pending(r) ? <Button size="sm" variant="secondary" onClick={() => navigate('/erp/sales/orders')}>Create sales order</Button> : null) },
        ]}
      />
      {suggestions.length > 0 && (
        <Card title="Suggested replenishments" subtitle="Stores with items below minimum stock right now">
          <div className="divide-y divide-slate-100">
            {suggestions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="text-sm font-medium text-slate-800">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.below.slice(0, 3).map((b) => `${pname(b.productId)} (${b.qty}/${b.min})`).join(', ')}{s.below.length > 3 ? ` +${s.below.length - 3} more` : ''}</div>
                </div>
                <Button size="sm" variant="soft" icon={PackagePlus} onClick={() => raiseOrder(s, s.below)}>Create order</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function MixTab({ lines, posOrders, stores }) {
  const months = lastMonths(12)
  const fyLines = lines.filter((l) => l.month >= months[0])
  const byType = aggregate(fyLines, (l) => l.partnerType || 'OTHER')
  const label = { DEALER: 'Dealers', FRANCHISE: 'Franchise stores', EXPORT: 'Export' }
  const donut = byType.map((r) => ({ name: label[r.key] || r.key, value: r.revenue })).sort((a, b) => b.value - a.value)
  const trend = months.map((m) => {
    const ls = fyLines.filter((l) => l.month === m)
    return { label: monthLabel(m), dealer: round2(sum(ls.filter((l) => l.partnerType === 'DEALER'), (l) => l.revenue)), franchise: round2(sum(ls.filter((l) => l.partnerType === 'FRANCHISE'), (l) => l.revenue)) }
  })
  const fr = byType.find((r) => r.key === 'FRANCHISE')
  const dl = byType.find((r) => r.key === 'DEALER')
  const total = sum(byType, (r) => r.revenue)
  const storeRows = stores.map((s) => {
    const ls = fyLines.filter((l) => l.partnerId === s.id)
    const rev = sum(ls, (l) => l.revenue)
    return { id: s.id, name: s.name, city: s.city, rev, margin: sum(ls, (l) => l.revenue - l.cost), share: total ? (rev / total) * 100 : 0, sellOut: s.sellOutAll, posBills: posOrders.filter((o) => o.partnerId === s.id).length }
  })
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat label="Dealer revenue (12M)" value={fmtCompact(dl?.revenue || 0)} sub={`${total ? ((dl?.revenue || 0) / total * 100).toFixed(1) : 0}% of total`} tone="ink" />
        <Stat label="Franchise revenue (12M)" value={fmtCompact(fr?.revenue || 0)} sub={`${total ? ((fr?.revenue || 0) / total * 100).toFixed(1) : 0}% of total`} />
        <Stat label="Dealer margin %" value={`${dl?.marginPct ?? 0}%`} tone="green" />
        <Stat label="Franchise margin %" value={`${fr?.marginPct ?? 0}%`} tone="green" />
      </Grid>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Revenue contribution by channel" subtitle="Last 12 months, invoiced (ex-GST)">
          <DonutChart data={donut} />
        </Card>
        <Card title="Monthly sell-in: dealers vs franchise" className="lg:col-span-2">
          <BarsChart data={trend} stacked series={[{ key: "dealer", label: "Dealers", color: "#2f416b" }, { key: "franchise", label: "Franchise stores", color: "#f2541f" }]} />
        </Card>
      </div>
      <DataTable
        rows={storeRows}
        searchable={false}
        exportName="Franchise-Revenue"
        initialSort={{ key: 'rev', dir: 'desc' }}
        columns={[
          { key: 'name', header: 'Store', render: (r) => <div><div className="font-medium text-slate-800">{r.name}</div><div className="text-[11px] text-slate-500">{r.city}</div></div> },
          { key: 'rev', header: 'Sell-in (12M)', align: 'right', render: (r) => fmtINR(r.rev) },
          { key: 'margin', header: 'Btali margin', align: 'right', render: (r) => fmtINR(r.margin) },
          { key: 'share', header: 'Share of company revenue', align: 'right', render: (r) => `${r.share.toFixed(2)}%` },
          { key: 'sellOut', header: 'POS sell-out', align: 'right', render: (r) => fmtINR(r.sellOut) },
          { key: 'posBills', header: 'POS bills', align: 'right' },
        ]}
      />
    </div>
  )
}
