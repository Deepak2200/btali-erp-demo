import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarClock, ShoppingCart, Sparkles, X, Info, BellRing } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { PageHeader, Grid, Stat, Card, Badge, Button, Modal, Select, Segmented, NumberInput, Alert, Drawer, DescriptionList, toast, SectionTitle } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, VendorName, TrendChart } from '../../../components/business'
import { fmtNum, fmtDate, fmtMoney, fmtCompact, sum, groupBy, monthLabel } from '../../../lib/format'
import { onHand } from '../../../lib/stock'
import { reorderRecommendation } from '../../../lib/analytics'
import { nextCycle } from './_purchaseKit'

const URG_TONE = { CRITICAL: 'red', HIGH: 'amber', MEDIUM: 'blue', LOW: 'gray' }
const URG_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export default function Reorder() {
  const state = useStore()
  const nav = useNavigate()
  const user = useUser()
  const createPO = useStore((s) => s.createPO)
  const { products, vendors, settings } = state
  const [scope, setScope] = useState('ALERTS')
  const [vendor, setVendor] = useState('')
  const [cat, setCat] = useState('')
  const [urg, setUrg] = useState('')
  const [banner, setBanner] = useState(true)
  const [draft, setDraft] = useState(null)
  const [detail, setDetail] = useState(null)

  const rows = useMemo(() => products.filter((p) => p.active).map((p) => {
    const r = reorderRecommendation(state, p)
    const oh = onHand(state, p.id)
    return { ...r, id: p.id, product: p, vendorId: p.vendorId, category: p.category, breach: oh < p.reorderLevel, oh }
  }), [products, state])

  const alerts = rows.filter((r) => r.breach || r.urgency === 'CRITICAL' || r.urgency === 'HIGH')
  const base = scope === 'ALERTS' ? alerts : rows.filter((r) => r.qty > 0 || r.breach)
  const view = base.filter((r) => (!vendor || r.vendorId === vendor) && (!cat || r.category === cat) && (!urg || r.urgency === urg))
    .sort((a, b) => URG_ORDER[a.urgency] - URG_ORDER[b.urgency] || a.oh / a.product.reorderLevel - b.oh / b.product.reorderLevel)
  const cyc = nextCycle(settings.reorderCycleDay || 15)
  const critical = alerts.filter((r) => r.urgency === 'CRITICAL')
  const fx = settings.fx

  const startPO = (sel) => {
    const lines = sel.map((r) => ({ productId: r.id, vendorId: r.vendorId, qty: r.qty || r.product.moq, rate: r.product.vendorRate }))
    setDraft(lines)
  }
  const groups = draft ? Object.entries(groupBy(draft, (l) => l.vendorId)) : []
  const submit = (asDraft) => {
    const made = []
    for (const [vid, lines] of groups) {
      const v = vendors.find((x) => x.id === vid)
      const ls = lines.filter((l) => l.qty > 0).map(({ productId, qty, rate }) => ({ productId, qty: Number(qty), rate: Number(rate), mrp: products.find((p) => p.id === productId)?.mrp }))
      if (!ls.length) continue
      made.push(createPO({ type: v.type === 'INDIA' ? 'DOMESTIC' : 'IMPORT', vendorId: vid, lines: ls, source: 'REORDER_ALERT', draft: asDraft, note: `Raised from reorder alerts for the ${fmtDate(cyc.date)} cycle` }))
    }
    setDraft(null)
    if (!made.length) return toast.error('No lines with quantity')
    toast.success(`${made.length} PO${made.length > 1 ? 's' : ''} ${asDraft ? 'saved as draft' : 'sent for approval'}`, made.map((p) => p.number).join(', '))
    nav(made.length === 1 ? `/erp/purchase/orders/${made[0].id}` : '/erp/purchase/orders')
  }

  const columns = [
    { key: 'product', header: 'Product', value: (r) => `${r.product.sku} ${r.product.shortName}`, render: (r) => <ProductCell product={r.product} sub={r.category} /> },
    { key: 'vendor', header: 'Vendor', value: (r) => vendors.find((v) => v.id === r.vendorId)?.name, render: (r) => <span className="text-xs whitespace-nowrap" title={vendors.find((v) => v.id === r.vendorId)?.name}>{vendors.find((v) => v.id === r.vendorId)?.name.split(' ').slice(0, 2).join(' ')}</span> },
    { key: 'oh', header: 'On hand', align: 'right', value: (r) => r.oh, render: (r) => <span className={r.breach ? 'text-red-600 font-semibold' : ''}>{fmtNum(r.oh)}</span> },
    { key: 'reorder', header: 'Reorder / MOQ', align: 'right', value: (r) => r.product.reorderLevel, render: (r) => <span className="text-slate-500">{fmtNum(r.product.reorderLevel)} / {fmtNum(r.product.moq)}</span> },
    { key: 'book', header: 'Booked', align: 'right', value: (r) => r.book },
    { key: 'incoming', header: 'Incoming', align: 'right', value: (r) => r.incoming },
    { key: 'cover', header: 'Cover', align: 'right', value: (r) => r.daysOfCover, render: (r) => (r.daysOfCover >= 999 ? '—' : `${Math.max(0, r.daysOfCover)} d`) },
    { key: 'qty', header: 'AI qty', align: 'right', value: (r) => r.qty, render: (r) => <span className="font-semibold text-ink-900">{r.qty ? fmtNum(r.qty) : '—'}</span> },
    { key: 'orderBy', header: 'Order by', value: (r) => r.orderBy || '9999', render: (r) => (r.orderBy ? <span className={`whitespace-nowrap ${r.orderInDays <= 0 ? 'text-red-600 font-medium' : ''}`}>{fmtDate(r.orderBy)}</span> : '—') },
    { key: 'confidence', header: 'Confidence', render: (r) => <Badge tone={r.confidence === 'High' ? 'green' : r.confidence === 'Medium' ? 'amber' : 'gray'}>{r.confidence}</Badge> },
    { key: 'urgency', header: 'Urgency', value: (r) => URG_ORDER[r.urgency], render: (r) => <Badge tone={URG_TONE[r.urgency]} dot>{r.urgency}</Badge> },
    { key: 'why', header: '', sortable: false, export: false, render: (r) => <Button size="sm" variant="ghost" icon={Info} onClick={(e) => { e.stopPropagation(); setDetail(r) }}>Why</Button> },
  ]

  const canCreate = ['PURCHASE', 'ADMIN'].includes(user?.role)

  return (
    <div>
      <PageHeader title="Reorder Alerts" subtitle="System monitors stock against MOQ & reorder thresholds. Purchase reviews and raises POs – nothing is drafted automatically." />

      {banner && alerts.length > 0 && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-amber-50 p-4 flex gap-3 items-start shadow-sm animate-[slidein_.25s_ease-out]">
          <div className="p-2 rounded-xl bg-red-500 text-white shrink-0"><BellRing className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-red-900">{alerts.length} products have breached reorder thresholds</div>
            <div className="text-sm text-red-800/80 mt-0.5">
              {critical.length ? `${critical.length} out of stock: ${critical.slice(0, 3).map((r) => r.product.shortName).join(', ')}${critical.length > 3 ? '…' : ''}. ` : ''}
              {alerts.filter((r) => r.urgency === 'HIGH').length} need ordering now. Suggested value {fmtCompact(sum(alerts, (r) => r.qty * r.product.vendorRate * (fx[r.product.currency] || 1)))}.
            </div>
          </div>
          {canCreate && <Button size="sm" variant="danger" icon={ShoppingCart} onClick={() => startPO(alerts.filter((r) => r.qty > 0))}>Review & raise POs</Button>}
          <button className="text-red-400 hover:text-red-700" onClick={() => setBanner(false)} title="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      <Alert tone="info" className="mb-4" title={`Next consolidation cycle: ${fmtDate(cyc.date)} – ${cyc.days} day${cyc.days === 1 ? '' : 's'} away`}>
        Btali consolidates import orders on the {settings.reorderCycleDay || 15}th of every month. Items with an order-by date before the cycle should be raised separately; the rest can wait for the consolidated PO.
      </Alert>

      <Grid cols={4}>
        <Stat label="Below reorder level" value={rows.filter((r) => r.breach).length} icon={AlertTriangle} tone="red" />
        <Stat label="Out of stock" value={critical.length} icon={AlertTriangle} tone="amber" />
        <Stat label="Order before cycle" value={rows.filter((r) => r.qty > 0 && r.orderBy && r.orderBy < cyc.date).length} sub={`before ${fmtDate(cyc.date)}`} icon={CalendarClock} tone="violet" />
        <Stat label="Suggested buy value" value={fmtCompact(sum(base, (r) => r.qty * r.product.vendorRate * (fx[r.product.currency] || 1)))} sub={`${base.filter((r) => r.qty).length} SKUs`} icon={Sparkles} />
      </Grid>

      <div className="flex flex-col md:flex-row gap-2 md:items-center mt-5 mb-3">
        <Segmented value={scope} onChange={setScope} options={[{ key: 'ALERTS', label: `Threshold breaches (${alerts.length})` }, { key: 'ALL', label: 'All AI suggestions' }]} />
        <div className="flex flex-col sm:flex-row gap-2 md:ml-auto">
          <Select value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="All vendors" options={vendors.filter((v) => ['CHINA', 'INDIA'].includes(v.type)).map((v) => ({ value: v.id, label: v.name }))} className="sm:w-56" />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All categories" options={[...new Set(products.map((p) => p.category))]} className="sm:w-44" />
          <Select value={urg} onChange={(e) => setUrg(e.target.value)} placeholder="All urgency" options={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']} className="sm:w-36" />
        </div>
      </div>

      <DataTable columns={columns} rows={view} exportName="reorder-suggestions" pageSize={15} onRowClick={setDetail}
        bulkActions={canCreate ? (sel, clear) => <Button size="sm" icon={ShoppingCart} onClick={() => { startPO(sel); clear() }}>Create PO ({new Set(sel.map((r) => r.vendorId)).size} vendor{new Set(sel.map((r) => r.vendorId)).size > 1 ? 's' : ''})</Button> : undefined}
        rowClass={(r) => (r.urgency === 'CRITICAL' ? 'bg-red-50/40' : '')} />

      <Modal open={!!draft} onClose={() => setDraft(null)} size="lg" title="Create purchase orders from alerts" subtitle="Lines are grouped by vendor – one PO per vendor. Adjust quantities before sending."
        footer={<>
          <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
          <Button variant="soft" onClick={() => submit(true)}>Save as draft</Button>
          <Button onClick={() => submit(false)}>Send for approval</Button>
        </>}>
        <div className="space-y-4">
          {groups.map(([vid, lines]) => {
            const v = vendors.find((x) => x.id === vid)
            return (
              <div key={vid} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 flex flex-wrap items-center gap-2 justify-between">
                  <div className="font-medium text-sm text-slate-800">{v.name} <Badge tone={v.type === 'CHINA' ? 'blue' : 'teal'}>{v.type === 'CHINA' ? 'IMPORT' : 'DOMESTIC'}</Badge></div>
                  <div className="text-xs text-slate-500">Terms {v.paymentTerms.advancePct}/{v.paymentTerms.balancePct}{v.paymentTerms.creditDays ? ` · ${v.paymentTerms.creditDays}d credit` : ''} · <b className="text-slate-700">{fmtMoney(sum(lines, (l) => l.qty * l.rate), v.currency)}</b></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((l) => {
                        const p = products.find((x) => x.id === l.productId)
                        return (
                          <tr key={l.productId}>
                            <td className="px-3 py-2 min-w-[220px]"><ProductCell product={p} sub={`MOQ ${p.moq}`} /></td>
                            <td className="px-3 py-2 w-32"><NumberInput min={0} value={l.qty} onChange={(q) => setDraft((d) => d.map((x) => (x.productId === l.productId ? { ...x, qty: q } : x)))} className="text-right" />
                              {l.qty > 0 && l.qty < p.moq && <div className="text-[10px] text-amber-600 mt-0.5 text-right">Below MOQ {p.moq}</div>}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500 whitespace-nowrap">@ {fmtMoney(l.rate, v.currency)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">{fmtMoney(l.qty * l.rate, v.currency)}</td>
                            <td className="px-1"><button className="text-slate-400 hover:text-red-600 p-1" title="Remove" onClick={() => setDraft((d) => d.filter((x) => x.productId !== l.productId))}><X className="w-4 h-4" /></button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {groups.length === 0 && <div className="text-sm text-slate-500 text-center py-6">No lines selected.</div>}
        </div>
      </Modal>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.product.name} subtitle={`${detail?.product.sku} · ${detail?.category}`}
        footer={canCreate && detail && <Button icon={ShoppingCart} onClick={() => { startPO([detail]); setDetail(null) }}>Create PO for this item</Button>}>
        {detail && (
          <div className="space-y-5">
            <div className="rounded-xl bg-gradient-to-br from-ink-900 to-ink-700 text-white p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/70"><Sparkles className="w-4 h-4" /> AI recommendation</div>
              <div className="mt-2 flex flex-wrap gap-6">
                <div><div className="text-2xl font-bold">{detail.qty ? fmtNum(detail.qty) : 'No order'}</div><div className="text-xs text-white/70">units (MOQ multiples)</div></div>
                <div><div className="text-2xl font-bold">{detail.orderBy ? fmtDate(detail.orderBy) : '—'}</div><div className="text-xs text-white/70">order by</div></div>
                <div><div className="text-2xl font-bold">{detail.confidence}</div><div className="text-xs text-white/70">confidence</div></div>
              </div>
            </div>
            <div>
              <SectionTitle>Why this suggestion</SectionTitle>
              <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">{detail.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <DescriptionList cols={3} items={[
              ['On hand', fmtNum(detail.oh)], ['Reorder level', fmtNum(detail.product.reorderLevel)], ['MOQ', fmtNum(detail.product.moq)],
              ['Booked (paid)', fmtNum(detail.book)], ['Incoming', fmtNum(detail.incoming)], ['Lead time', `${detail.product.leadTimeDays} days`],
              ['Avg daily demand', fmtNum(detail.daily)], ['Days of cover', detail.daysOfCover >= 999 ? '—' : `${Math.max(0, detail.daysOfCover)} days`], ['Vendor rate', fmtMoney(detail.product.vendorRate, detail.product.currency)],
            ]} />
            <div>
              <SectionTitle>Demand forecast (next 3 months)</SectionTitle>
              <TrendChart money={false} height={180} data={detail.forecast.map((f) => ({ label: f.label || (f.month ? monthLabel(f.month) : ''), qty: f.qty }))} series={[{ key: 'qty', label: 'Forecast units' }]} />
            </div>
            {detail.incomingList.length > 0 && (
              <div>
                <SectionTitle>Already in pipeline</SectionTitle>
                <ul className="text-sm divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {detail.incomingList.map((x) => <li key={x.poId} className="px-3 py-2 flex justify-between"><span className="font-mono text-brand-700">{x.poNumber}</span><span>{fmtNum(x.qty)} · {x.stage.replace(/_/g, ' ').toLowerCase()}{x.eta ? ` · ETA ${fmtDate(x.eta)}` : ''}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
