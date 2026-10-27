import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, ShoppingCart, AlertTriangle, Boxes, Wallet, Download, RotateCcw, Sparkles, Ship } from 'lucide-react'
import { useStore } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Badge, StatusBadge, Button, Drawer, Select, Checkbox, NumberInput, Alert, SectionTitle, KV, toast, confirm, cx,
} from '../../../components/ui'
import { ProductCell, TrendChart, FMSBadge } from '../../../components/business'
import { reorderRecommendation, productDemand, fmsMap } from '../../../lib/analytics'
import { fmtINR, fmtNum, fmtDate, fmtCompact, sum, round2, exportCSV, daysBetween, today } from '../../../lib/format'

const URGENCY_TONE = { CRITICAL: 'red', HIGH: 'red', MEDIUM: 'amber', LOW: 'gray' }
const CONF_TONE = { High: 'green', Medium: 'amber', Low: 'gray' }
const roundMoq = (q, moq) => (q > 0 ? Math.ceil(q / (moq || 1)) * (moq || 1) : 0)

function Slider({ label, value, onChange, min, max, step = 1, suffix = 'days', hint }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold text-ink-900 tabular-nums">{value} {suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#f2541f]" />
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  )
}

export default function Planner() {
  const navigate = useNavigate()
  const products = useStore((s) => s.products)
  const stock = useStore((s) => s.stock)
  const salesOrders = useStore((s) => s.salesOrders)
  const purchaseOrders = useStore((s) => s.purchaseOrders)
  const shipments = useStore((s) => s.shipments)
  const invoices = useStore((s) => s.invoices)
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const settings = useStore((s) => s.settings)
  const createPO = useStore((s) => s.createPO)

  const [coverDays, setCoverDays] = useState(45)
  const [safetyDays, setSafetyDays] = useState(15)
  const [cat, setCat] = useState('')
  const [vendorF, setVendorF] = useState('')
  const [urg, setUrg] = useState('')
  const [onlyNeed, setOnlyNeed] = useState(true)
  const [overrides, setOverrides] = useState({})
  const [sel, setSel] = useState(new Set())
  const [detail, setDetail] = useState(null)
  const [created, setCreated] = useState([])

  const state = useMemo(() => ({ products, stock, salesOrders, purchaseOrders, shipments, invoices, partners, settings }), [products, stock, salesOrders, purchaseOrders, shipments, invoices, partners, settings])
  const fms = useMemo(() => fmsMap(state, 90), [state])
  const fx = settings.fx || {}

  const recs = useMemo(() => products.filter((p) => p.active).map((p) => {
    const r = reorderRecommendation(state, p, { coverDays, safetyDays })
    const qty = overrides[p.id] != null ? overrides[p.id] : r.qty
    const unitINR = p.vendorRate * (fx[p.currency] || 1)
    return { ...r, product: p, vendorId: p.vendorId, category: p.category, qty, aiQty: r.qty, edited: overrides[p.id] != null, unitINR, value: round2(qty * unitINR), cbm: round2(qty * (p.cbm || 0)) }
  }), [products, state, coverDays, safetyDays, overrides, fx])

  const rows = useMemo(() => recs.filter((r) =>
    (!cat || r.category === cat) && (!vendorF || r.vendorId === vendorF) && (!urg || r.urgency === urg) && (!onlyNeed || r.aiQty > 0 || r.qty > 0),
  ).sort((a, b) => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].indexOf(a.urgency) - ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].indexOf(b.urgency) || (a.orderInDays - b.orderInDays)), [recs, cat, vendorF, urg, onlyNeed])

  const toOrder = recs.filter((r) => r.qty > 0)
  const importCbm = sum(toOrder.filter((r) => r.product.currency !== 'INR'), (r) => r.cbm)
  const selectedRows = recs.filter((r) => sel.has(r.productId) && r.qty > 0)
  const vname = (id) => vendors.find((v) => v.id === id)?.name || id

  const toggle = (id, v) => setSel((s) => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n })
  const allSel = rows.length > 0 && rows.filter((r) => r.qty > 0).every((r) => sel.has(r.productId))

  const setQty = (id, v) => setOverrides((o) => ({ ...o, [id]: v === '' ? 0 : Math.max(0, Number(v) || 0) }))
  const commitQty = (r) => setOverrides((o) => (o[r.productId] == null ? o : { ...o, [r.productId]: roundMoq(o[r.productId], r.product.moq) }))

  const createPOs = async () => {
    if (!selectedRows.length) return toast.error('Select at least one item with a quantity to order')
    const groups = {}
    for (const r of selectedRows) (groups[r.vendorId] = groups[r.vendorId] || []).push(r)
    const ok = await confirm({
      title: `Create ${Object.keys(groups).length} purchase order${Object.keys(groups).length > 1 ? 's' : ''}?`,
      message: `${Object.entries(groups).map(([v, list]) => `• ${vname(v)} – ${list.length} item(s), ${fmtINR(sum(list, (x) => x.value))}`).join('\n')}\n\nPOs will be raised from the AI Planner and sent to the Director for approval.`,
      confirmText: 'Create POs',
    })
    if (!ok) return
    const out = []
    for (const [vendorId, list] of Object.entries(groups)) {
      const vendor = vendors.find((v) => v.id === vendorId)
      const po = createPO({
        type: vendor?.currency === 'INR' ? 'DOMESTIC' : 'IMPORT', vendorId,
        lines: list.map((r) => ({ productId: r.productId, qty: r.qty, rate: r.product.vendorRate, mrp: r.product.mrp })),
        source: 'AI_PLANNER',
        note: `AI planner recommendation – cover ${coverDays} days + safety ${safetyDays} days`,
      })
      out.push(po)
    }
    setCreated(out)
    setSel(new Set())
    toast.success(`${out.length} PO${out.length > 1 ? 's' : ''} created`, out.map((p) => p.number).join(', ') + ' – sent for approval')
  }

  const exportRows = () => exportCSV(`AI-Procurement-Plan-${today()}.csv`, rows, [
    { header: 'SKU', value: (r) => r.product.sku },
    { header: 'Product', value: (r) => r.product.shortName },
    { header: 'Category', value: (r) => r.category },
    { header: 'Vendor', value: (r) => vname(r.vendorId) },
    { header: 'On hand', value: (r) => r.onHand },
    { header: 'Booked', value: (r) => r.book },
    { header: 'Incoming', value: (r) => r.incoming },
    { header: 'Forecast / month', value: (r) => r.monthly },
    { header: 'Days of cover', value: (r) => (r.daysOfCover >= 999 ? '' : r.daysOfCover) },
    { header: 'Order by', value: (r) => r.orderBy || '' },
    { header: 'AI qty', value: (r) => r.aiQty },
    { header: 'Planned qty', value: (r) => r.qty },
    { header: 'MOQ', value: (r) => r.product.moq },
    { header: 'Value INR', value: (r) => r.value },
    { header: 'CBM', value: (r) => r.cbm },
    { header: 'Urgency', value: (r) => r.urgency },
    { header: 'Confidence', value: (r) => r.confidence },
    { header: 'Reasons', value: (r) => r.reasons.join(' | ') },
  ])

  const categories = [...new Set(products.map((p) => p.category))]
  const vendorOpts = [...new Set(products.map((p) => p.vendorId))].map((id) => ({ value: id, label: vname(id) }))

  return (
    <div>
      <PageHeader
        title="AI Procurement Planner"
        subtitle={`Seasonal demand forecast × stock position × lead time → what to order, how much and by when · reorder cycle on day ${settings.reorderCycleDay} of each month`}
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportRows}>Export plan</Button>
          <Button icon={ShoppingCart} disabled={!selectedRows.length} onClick={createPOs}>Create POs ({selectedRows.length})</Button>
        </>}
      />

      {created.length > 0 && (
        <Alert tone="success" className="mb-4" title={`${created.length} purchase order${created.length > 1 ? 's' : ''} raised from the planner`}
          action={<Button size="sm" variant="ghost" onClick={() => setCreated([])}>Dismiss</Button>}>
          <div className="flex flex-wrap gap-2 mt-1">
            {created.map((po) => <Button key={po.id} size="sm" variant="secondary" onClick={() => navigate(`/erp/purchase/orders/${po.id}`)}>{po.number} · {vname(po.vendorId)}</Button>)}
          </div>
        </Alert>
      )}

      <Grid cols={4} className="mb-4">
        <Stat icon={ShoppingCart} label="Items to order" value={fmtNum(toOrder.length)} sub={`of ${recs.length} active SKUs`} />
        <Stat icon={Wallet} tone="ink" label="Planned purchase value" value={fmtCompact(sum(toOrder, (r) => r.value))} sub="at vendor rate, INR" />
        <Stat icon={AlertTriangle} tone="red" label="Critical / high urgency" value={fmtNum(recs.filter((r) => r.urgency === 'CRITICAL' || r.urgency === 'HIGH').length)} sub="order now" />
        <Stat icon={Ship} tone="blue" label="Import volume (est.)" value={`${fmtNum(Math.round(importCbm))} CBM`} sub={`≈ ${Math.max(0, Math.ceil(importCbm / 68))} × 40HC container`} />
      </Grid>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-4">
        <Card title="What-if scenario" subtitle="Recommendations recompute instantly" className="xl:col-span-1">
          <div className="space-y-4">
            <Slider label="Cover after arrival" value={coverDays} onChange={setCoverDays} min={15} max={120} step={5} hint="Days of demand each order should cover once it lands" />
            <Slider label="Safety stock" value={safetyDays} onChange={setSafetyDays} min={0} max={45} hint="Buffer against forecast error and port delays" />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => { setCoverDays(45); setSafetyDays(15); setOverrides({}) }}>Reset</Button>
              {Object.keys(overrides).length > 0 && <Badge tone="amber">{Object.keys(overrides).length} manual edits</Badge>}
            </div>
            <div className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3 flex gap-2">
              <Sparkles className="w-4 h-4 text-brand-500 shrink-0" />
              Forecast blends each SKU's 12-month history with category seasonality (pumps peak pre-monsoon, sprayers in kharif, washers & vacuums at Diwali). Quantities are rounded up to vendor MOQ.
            </div>
          </div>
        </Card>
        <Card title="Plan by vendor" subtitle="Items currently recommended for ordering" className="xl:col-span-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(toOrder.reduce((m, r) => { (m[r.vendorId] = m[r.vendorId] || []).push(r); return m }, {})).sort((a, b) => sum(b[1], (x) => x.value) - sum(a[1], (x) => x.value)).map(([v, list]) => {
              const allIn = list.every((r) => sel.has(r.productId))
              return (
                <div key={v} className="border border-slate-200 rounded-lg p-3">
                  <div className="text-sm font-semibold text-slate-800 truncate">{vname(v)}</div>
                  <div className="text-xs text-slate-500 mb-2">{list.length} SKUs · {fmtNum(round2(sum(list, (r) => r.cbm)))} CBM</div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold tabular-nums text-ink-900">{fmtINR(sum(list, (r) => r.value))}</span>
                    <Button size="sm" variant={allIn ? 'secondary' : 'soft'} onClick={() => setSel((s) => { const n = new Set(s); list.forEach((r) => (allIn ? n.delete(r.productId) : n.add(r.productId))); return n })}>{allIn ? 'Deselect' : 'Select all'}</Button>
                  </div>
                </div>
              )
            })}
            {toOrder.length === 0 && <div className="text-sm text-slate-400">No purchases required for this scenario.</div>}
          </div>
        </Card>
      </div>

      <Card padded={false}>
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between p-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-2 flex-1">
            <Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All categories" options={categories} className="sm:w-48" />
            <Select value={vendorF} onChange={(e) => setVendorF(e.target.value)} placeholder="All vendors" options={vendorOpts} className="sm:w-56" />
            <Select value={urg} onChange={(e) => setUrg(e.target.value)} placeholder="All urgency" options={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']} className="sm:w-40" />
          </div>
          <Checkbox label="Only items needing an order" checked={onlyNeed} onChange={setOnlyNeed} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-slate-500 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2.5 w-10"><Checkbox checked={allSel} onChange={(v) => setSel((s) => { const n = new Set(s); rows.filter((r) => r.qty > 0).forEach((r) => (v ? n.add(r.productId) : n.delete(r.productId))); return n })} /></th>
                <th className="px-3 py-2.5 text-left">Product</th>
                <th className="px-3 py-2.5 text-right">On hand</th>
                <th className="px-3 py-2.5 text-right">Incoming</th>
                <th className="px-3 py-2.5 text-right">Fcst / mo</th>
                <th className="px-3 py-2.5 text-right">Cover</th>
                <th className="px-3 py-2.5 text-left">Order by</th>
                <th className="px-3 py-2.5 text-right w-32">Order qty</th>
                <th className="px-3 py-2.5 text-right">Value</th>
                <th className="px-3 py-2.5 text-left">Urgency</th>
                <th className="px-3 py-2.5 text-left">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const overdue = r.orderBy && r.orderInDays <= 0
                return (
                  <tr key={r.productId} className={cx('hover:bg-brand-50/40 cursor-pointer', sel.has(r.productId) && 'bg-brand-50/60')} onClick={() => setDetail(r.productId)}>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><Checkbox checked={sel.has(r.productId)} onChange={(v) => toggle(r.productId, v)} /></td>
                    <td className="px-3 py-2 min-w-[220px]"><ProductCell product={r.product} sub={vname(r.vendorId).split(' ').slice(0, 2).join(' ')} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={cx(r.onHand < r.product.reorderLevel && 'text-red-600 font-semibold')}>{fmtNum(r.onHand)}</span>
                      <div className="text-[10px] text-slate-400">ROL {r.product.reorderLevel}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.incoming ? fmtNum(r.incoming) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.monthly)} <div className="mt-0.5"><FMSBadge cls={fms[r.productId]?.cls} /></div></td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.daysOfCover >= 999 ? '—' : <span className={cx(r.daysOfCover < r.product.leadTimeDays && 'text-red-600 font-semibold')}>{fmtNum(Math.max(0, r.daysOfCover))} d</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.orderBy ? <span className={cx(overdue ? 'text-red-600 font-semibold' : 'text-slate-700')}>{overdue ? 'Now' : fmtDate(r.orderBy)}</span> : '—'}<div className="text-[10px] text-slate-400">lead {r.product.leadTimeDays} d</div></td>
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <NumberInput min={0} step={r.product.moq} value={r.qty} onChange={(v) => setQty(r.productId, v)} onBlur={() => commitQty(r)} className={cx('text-right py-1', r.edited && 'border-amber-400 bg-amber-50/50')} />
                      <div className="text-[10px] text-slate-400 mt-0.5">{r.edited ? `AI ${fmtNum(r.aiQty)} · ` : ''}MOQ {r.product.moq}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{r.value ? fmtINR(r.value) : '—'}</td>
                    <td className="px-3 py-2"><Badge tone={URGENCY_TONE[r.urgency]} dot>{r.urgency === 'CRITICAL' ? 'Critical' : r.urgency[0] + r.urgency.slice(1).toLowerCase()}</Badge></td>
                    <td className="px-3 py-2"><Badge tone={CONF_TONE[r.confidence]}>{r.confidence}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="text-center text-sm text-slate-400 py-10">No products match these filters.</div>}
        </div>
        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-t border-slate-100 bg-brand-50/60 text-sm">
            <span><b>{selectedRows.length}</b> items · <b>{fmtINR(sum(selectedRows, (r) => r.value))}</b> · {new Set(selectedRows.map((r) => r.vendorId)).size} vendor(s)</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
              <Button size="sm" icon={ShoppingCart} onClick={createPOs}>Create POs</Button>
            </div>
          </div>
        )}
      </Card>

      <PlanDetail rec={recs.find((r) => r.productId === detail)} state={state} vname={vname} onClose={() => setDetail(null)}
        onSelect={(id) => { toggle(id, true); setDetail(null); toast.info('Added to selection') }} fms={fms} />
    </div>
  )
}

function PlanDetail({ rec, state, vname, onClose, onSelect, fms }) {
  const data = useMemo(() => {
    if (!rec) return []
    const hist = productDemand(state, rec.productId, 12)
    const rowsH = hist.map((h, i) => ({ label: h.label, actual: h.qty, forecast: i === hist.length - 1 ? h.qty : null }))
    const rowsF = rec.forecast.filter((f) => !hist.some((h) => h.month === f.month)).map((f) => ({ label: f.label, actual: null, forecast: f.qty }))
    return [...rowsH, ...rowsF]
  }, [rec, state])
  if (!rec) return null
  const p = rec.product
  return (
    <Drawer open onClose={onClose} title={p.shortName} subtitle={`${p.sku} · ${p.category} · ${vname(p.vendorId)}`} width="max-w-3xl"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{rec.qty > 0 && <Button icon={ShoppingCart} onClick={() => onSelect(rec.productId)}>Select for PO</Button>}</>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <MiniStat label="Recommended" value={fmtNum(rec.qty)} sub={`MOQ ${p.moq}`} />
        <MiniStat label="Order by" value={rec.orderBy ? (rec.orderInDays <= 0 ? 'Now' : fmtDate(rec.orderBy)) : 'Not needed'} sub={rec.orderBy ? `${Math.max(0, daysBetween(today(), rec.orderBy))} days left` : ''} />
        <MiniStat label="Days of cover" value={rec.daysOfCover >= 999 ? '—' : `${Math.max(0, rec.daysOfCover)} d`} sub={`lead ${p.leadTimeDays} d`} />
        <MiniStat label="Confidence" value={rec.confidence} sub={<StatusBadge status={rec.urgency} />} />
      </div>
      <Card title="Demand – 12 months actual & 3-month forecast" subtitle="Units · dashed line is the seasonal forecast" className="mb-4">
        <TrendChart data={data} type="line" money={false} height={240} series={[{ key: 'actual', label: 'Actual units' }, { key: 'forecast', label: 'Forecast', dashed: true, color: '#2f416b' }]} />
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <SectionTitle>Why this recommendation</SectionTitle>
          <ul className="space-y-1.5">
            {rec.reasons.map((x, i) => <li key={i} className="text-sm text-slate-700 flex gap-2"><Brain className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />{x}</li>)}
          </ul>
          <SectionTitle className="mt-4">Forecast</SectionTitle>
          {rec.forecast.map((f) => <KV key={f.month} label={f.label} value={`${fmtNum(f.qty)} units`} />)}
        </div>
        <div>
          <SectionTitle>Stock position</SectionTitle>
          <KV label="On hand (Starex)" value={fmtNum(rec.onHand)} />
          <KV label="Booked (paid, not dispatched)" value={fmtNum(rec.book)} />
          <KV label="Incoming" value={fmtNum(rec.incoming)} />
          <KV label="Reorder level / Max" value={`${p.reorderLevel} / ${p.maxLevel}`} />
          <KV label="Daily run-rate" value={fmtNum(rec.daily)} />
          <KV label="Movement (90 d)" value={<FMSBadge cls={fms[p.id]?.cls} />} />
          <KV label="Order value" value={fmtINR(rec.value)} />
          <KV label="Volume" value={`${fmtNum(rec.cbm)} CBM`} />
          {rec.incomingList.length > 0 && (
            <>
              <SectionTitle className="mt-4">Incoming</SectionTitle>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {rec.incomingList.map((x) => (
                  <li key={x.poId} className="px-3 py-2 flex items-center justify-between text-sm gap-2">
                    <span className="font-mono text-xs">{x.poNumber}</span>
                    <StatusBadge status={x.stage} />
                    <span className="tabular-nums">{fmtNum(x.qty)}</span>
                    <span className="text-xs text-slate-500">{x.eta ? `ETA ${fmtDate(x.eta)}` : 'ETA TBC'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Drawer>
  )
}

function MiniStat({ label, value, sub }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">{label}</div>
      <div className="text-lg font-bold text-ink-900 mt-0.5">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}
