import React, { useEffect, useMemo, useState } from 'react'
import { Calculator, Lock, Save, Ship, Wand2, Receipt, TrendingUp, Package } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Button, StatusBadge, Badge, Tabs, Segmented, Field, FormGrid, NumberInput, Select, FileUpload, AttachmentList,
  Alert, EmptyState, KV, toast, confirm, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, TrendChart } from '../../../components/business'
import { fmtINR, fmtDate, fmtNum, fmtPct, round2, sum } from '../../../lib/format'
import { rfqQuoteINR } from '../../../store/slices/procurement'

const COST_FIELDS = [
  ['freightINR', 'Ocean freight (INR)', 'From approved forwarder quote'],
  ['insurance', 'Marine insurance'],
  ['duty', 'Customs duty (BCD + SWS)'],
  ['igst', 'IGST on import', 'Input tax credit – not added to cost'],
  ['cha', 'CHA charges', 'Seaport Customs House Agents bill'],
  ['portTransport', 'Port → Btali transport', 'Shiv Sai Transport'],
  ['other', 'Other charges', 'CFS, detention, stamp duty…'],
]
const METHODS = [{ key: 'VALUE', label: 'By value' }, { key: 'WEIGHT', label: 'By weight' }, { key: 'VOLUME', label: 'By volume' }]

export default function LandedCost() {
  const shipments = useStore((s) => s.shipments)
  const [tab, setTab] = useState('calc')
  const pending = shipments.filter((s) => !s.landedCost?.finalized)
  const done = shipments.filter((s) => s.landedCost?.finalized)
  const [shId, setShId] = useState(pending.find((s) => s.status === 'AT_PORT')?.id || pending[0]?.id || shipments[0]?.id)
  return (
    <div>
      <PageHeader title="Customs & Landed Cost" subtitle="Capture freight, duty and clearing charges per container and allocate them to every product" />
      <Grid cols={4} className="mb-5">
        <Stat label="Containers to cost" value={pending.length} icon={Ship} tone="amber" sub={`${pending.filter((s) => s.status === 'AT_PORT' || s.status === 'CLEARED').length} at port / cleared`} />
        <Stat label="Finalised" value={done.length} icon={Lock} tone="green" />
        <Stat label="Duty paid (finalised)" value={fmtINR(sum(done, (s) => s.landedCost.duty))} icon={Receipt} tone="blue" />
        <Stat label="IGST credit available" value={fmtINR(sum(done, (s) => s.landedCost.igst))} icon={TrendingUp} tone="violet" sub="input tax credit" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'calc', label: 'Landed cost calculator' }, { key: 'history', label: 'Finalised shipments', count: done.length }, { key: 'products', label: 'Product landed history' }]} />
      {tab === 'calc' && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {shipments.map((s) => (
              <button key={s.id} onClick={() => setShId(s.id)} className={cx('text-left shrink-0 rounded-xl border px-3 py-2 bg-white transition-colors min-w-[200px]', s.id === shId ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300')}>
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-800">{s.number}</span>{s.landedCost?.finalized ? <Badge tone="green">Finalised</Badge> : <StatusBadge status={s.status} />}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{s.containerNo} · {s.containerType} · ETA {fmtDate(s.ata || s.eta)}</div>
              </button>
            ))}
          </div>
          {shId && <Calculator_ key={shId} shipmentId={shId} />}
        </>
      )}
      {tab === 'history' && <FinalisedHistory />}
      {tab === 'products' && <ProductHistory />}
    </div>
  )
}

function Calculator_({ shipmentId }) {
  const sh = useStore((s) => s.shipments.find((x) => x.id === shipmentId))
  const rfqs = useStore((s) => s.freightRfqs) || []
  const fx = useStore((s) => s.settings.fx)
  const products = useStore((s) => s.products)
  const pos = useStore((s) => s.purchaseOrders)
  const saveDraft = useStore((s) => s.saveLandedDraft)
  const finalize = useStore((s) => s.finalizeLandedCost)
  const addDocs = useStore((s) => s.addPoDocuments)
  const { product, vendor } = useLookup()
  const rfq = rfqs.find((r) => r.status === 'APPROVED' && (r.shipmentId === sh.id || r.poIds.some((id) => sh.poIds.includes(id))))
  const rfqQuote = rfq?.quotes.find((q) => q.id === rfq.selectedQuoteId)
  const freightDefault = rfqQuote ? Math.round(rfqQuoteINR(rfqQuote, fx)) : Math.round((sh.freight?.rate || 0) * (fx[sh.freight?.currency] || 1))
  const lc = sh.landedCost || {}
  const finalized = !!lc.finalized
  const [costs, setCosts] = useState({ freightINR: lc.freightINR || freightDefault, insurance: lc.insurance || 0, duty: lc.duty || 0, igst: lc.igst || 0, cha: lc.cha || 0, portTransport: lc.portTransport || 0, other: lc.other || 0, chaBill: lc.chaBill || null })
  const [method, setMethod] = useState(lc.method || 'VALUE')
  useEffect(() => { if (!finalized && !lc.freightINR && freightDefault) setCosts((c) => ({ ...c, freightINR: freightDefault })) }, []) // eslint-disable-line

  const myPos = pos.filter((p) => sh.poIds.includes(p.id))
  const goodsINR = sum(myPos, (po) => sum(po.lines, (l) => l.qty * l.rate * (fx[po.currency] || 1)))
  const alloc = useMemo(() => useStore.getState().computeLandedAllocation(shipmentId, costs, method), [shipmentId, costs, method, products]) // eslint-disable-line
  const charges = sum(['freightINR', 'insurance', 'duty', 'cha', 'portTransport', 'other'], (k) => costs[k])
  const set = (k, v) => setCosts((c) => ({ ...c, [k]: v === '' ? 0 : v }))

  const estimate = () => {
    const ins = Math.round((goodsINR + Number(costs.freightINR)) * 0.005)
    const assessable = goodsINR + Number(costs.freightINR) + ins
    const bcd = Math.round(assessable * 0.075)
    const duty = bcd + Math.round(bcd * 0.1)
    const igst = Math.round((assessable + duty) * 0.18)
    setCosts((c) => ({ ...c, insurance: c.insurance || ins, duty, igst, cha: c.cha || 28500, portTransport: c.portTransport || 14500 }))
    toast.info('Duty estimated', 'BCD 7.5% + SWS 10% on assessable value; IGST 18%. Replace with BOE figures when available.')
  }
  const doSave = () => { saveDraft(shipmentId, costs, method); toast.success('Draft saved') }
  const doFinal = async () => {
    if (!costs.duty || !costs.freightINR) return toast.error('Enter freight and customs duty before finalising')
    const ok = await confirm({ title: `Finalise landed cost for ${sh.number}?`, message: `Charges of ${fmtINR(charges)} will be allocated ${METHODS.find((m) => m.key === method).label.toLowerCase()} across ${alloc.length} product lines. Product landed costs are updated (weighted with existing stock) and Sales is notified to refresh price lists.`, confirmText: 'Finalise' })
    if (!ok) return
    finalize(shipmentId, costs, method)
    if (costs.chaBill) for (const po of myPos) addDocs(po.id, [costs.chaBill], 'CHA')
    toast.success('Landed cost finalised', 'Product master updated · price list refresh notified')
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">
      <Card title="Import charges" subtitle={`${sh.number} · ${myPos.map((p) => p.number).join(', ')} · ${vendor(sh.vendorId)?.name}`}
        actions={!finalized && <Button size="sm" variant="soft" icon={Wand2} onClick={estimate}>Estimate duty</Button>}>
        {finalized && <Alert tone="success" className="mb-3" title="Finalised">On {fmtDate(lc.finalizedAt)} · {METHODS.find((m) => m.key === lc.method)?.label}</Alert>}
        {rfq && !finalized && <Alert tone="info" className="mb-3">Freight prefilled from {rfq.number} ({vendor(rfq.selectedForwarderId)?.name})</Alert>}
        <KV label="Goods value (CIF basis, INR)" value={fmtINR(goodsINR)} className="border-b border-slate-100 mb-2" />
        <div className="space-y-3">
          {COST_FIELDS.map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint}>
              <NumberInput min={0} value={costs[k]} disabled={finalized} onChange={(v) => set(k, v)} className="text-right" />
            </Field>
          ))}
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1">CHA bill</div>
            {costs.chaBill ? <AttachmentList items={[costs.chaBill]} onRemove={finalized ? undefined : () => set('chaBill', null)} /> : !finalized && <FileUpload compact multiple={false} label="Upload CHA bill (PDF/image)" onFiles={([a]) => { setCosts((c) => ({ ...c, chaBill: { ...a, docType: 'CHA' } })); toast.success('CHA bill attached') }} />}
            {finalized && !costs.chaBill && <div className="text-sm text-slate-400">No bill attached</div>}
          </div>
          <Field label="Allocation method">
            <Segmented options={METHODS} value={method} onChange={finalized ? () => {} : setMethod} size="sm" />
          </Field>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100">
          <KV label="Charges added to cost" value={fmtINR(charges)} />
          <KV label="IGST (credit, excluded)" value={fmtINR(costs.igst)} />
          <KV label="Total landed value" value={<span className="text-brand-600">{fmtINR(goodsINR + charges)}</span>} />
          <KV label="Landed factor" value={goodsINR ? `${((goodsINR + charges) / goodsINR).toFixed(3)} ×` : '—'} />
        </div>
        {!finalized && <div className="flex gap-2 mt-4"><Button variant="secondary" icon={Save} onClick={doSave} className="flex-1">Save draft</Button><Button icon={Lock} onClick={doFinal} className="flex-1">Finalise</Button></div>}
      </Card>
      <Card className="min-w-0 self-start" title="Allocation preview" subtitle={finalized ? 'Allocation as finalised' : 'Live – updates as you type'} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Goods (INR)</th>
                <th className="text-right px-3 py-2">Share</th><th className="text-right px-3 py-2">Allocated</th><th className="text-right px-3 py-2">Unit landed</th>
                <th className="text-right px-3 py-2">Current</th><th className="text-right px-3 py-2">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alloc.map((a, i) => {
                const p = product(a.productId)
                const cur = finalized ? (p.landedHistory || []).find((h) => h.shipment === sh.number)?.weighted ?? p.landedCost : p.landedCost
                const variance = cur ? ((a.unitLanded - cur) / cur) * 100 : 0
                return (
                  <tr key={i}>
                    <td className="px-3 py-2"><ProductCell id={a.productId} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtINR(a.valueINR)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtPct(a.share)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtINR(a.allocated)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtINR(a.unitLanded, true)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtINR(cur)}</td>
                    <td className={cx('px-3 py-2 text-right tabular-nums font-medium', Math.abs(variance) < 2 ? 'text-slate-500' : variance > 0 ? 'text-red-600' : 'text-emerald-600')}>{variance > 0 ? '+' : ''}{variance.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(sum(alloc, (a) => a.qty))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtINR(sum(alloc, (a) => a.valueINR))}</td><td className="px-3 py-2 text-right">100%</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtINR(sum(alloc, (a) => a.allocated))}</td><td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-slate-500 px-4 py-3">Variance compares the unit landed cost of this container with the current weighted landed cost in the product master. Red = costlier than current.</p>
      </Card>
    </div>
  )
}

function FinalisedHistory() {
  const shipments = useStore((s) => s.shipments)
  const pos = useStore((s) => s.purchaseOrders)
  const fx = useStore((s) => s.settings.fx)
  const { vendor } = useLookup()
  const rows = shipments.filter((s) => s.landedCost?.finalized).map((s) => {
    const lc = s.landedCost
    const goods = sum(pos.filter((p) => s.poIds.includes(p.id)), (po) => sum(po.lines, (l) => l.qty * l.rate * (fx[po.currency] || 1)))
    const charges = sum(['freightINR', 'insurance', 'duty', 'cha', 'portTransport', 'other'], (k) => lc[k])
    return { id: s.id, number: s.number, container: s.containerNo, vendor: vendor(s.vendorId)?.name, date: lc.finalizedAt, method: lc.method, goods, freight: lc.freightINR, duty: lc.duty, igst: lc.igst, other: (lc.insurance || 0) + (lc.cha || 0) + (lc.portTransport || 0) + (lc.other || 0), charges, factor: goods ? round2((goods + charges) / goods) : 0 }
  })
  if (!rows.length) return <Card><EmptyState icon={Calculator} title="No finalised shipments yet" /></Card>
  return (
    <DataTable rows={rows} exportName="landed-cost-history" initialSort={{ key: 'date', dir: 'desc' }} columns={[
      { key: 'number', header: 'Shipment', render: (r) => <div><div className="font-medium">{r.number}</div><div className="text-[11px] text-slate-500">{r.container}</div></div> },
      { key: 'vendor', header: 'Vendor' },
      { key: 'date', header: 'Finalised', render: (r) => fmtDate(r.date) },
      { key: 'method', header: 'Method' },
      { key: 'goods', header: 'Goods', align: 'right', render: (r) => fmtINR(r.goods) },
      { key: 'freight', header: 'Freight', align: 'right', render: (r) => fmtINR(r.freight) },
      { key: 'duty', header: 'Duty', align: 'right', render: (r) => fmtINR(r.duty) },
      { key: 'other', header: 'Ins./CHA/Transport', align: 'right', render: (r) => fmtINR(r.other) },
      { key: 'igst', header: 'IGST credit', align: 'right', render: (r) => fmtINR(r.igst) },
      { key: 'factor', header: 'Landed factor', align: 'right', render: (r) => `${r.factor.toFixed(2)}×` },
    ]} />
  )
}

function ProductHistory() {
  const products = useStore((s) => s.products)
  const fx = useStore((s) => s.settings.fx)
  const [pid, setPid] = useState('')
  const rows = products.map((p) => {
    const base = p.vendorRate * (fx[p.currency] || 1)
    return { id: p.id, sku: p.sku, name: p.shortName, category: p.category, base, landed: p.landedCost, last: p.lastLandedCost, factor: base ? p.landedCost / base : 0, updates: (p.landedHistory || []).length, mrp: p.mrp }
  })
  const sel = products.find((p) => p.id === pid)
  const series = sel ? [{ label: 'Opening', unit: Math.round(sel.landedHistory?.length ? sel.landedHistory[0].weighted : sel.landedCost), weighted: Math.round(sel.landedHistory?.length ? sel.landedHistory[0].weighted : sel.landedCost) }, ...(sel.landedHistory || []).map((h) => ({ label: `${h.shipment.slice(-4)} · ${fmtDate(h.date).slice(0, 6)}`, unit: h.unit, weighted: h.weighted }))] : []
  return (
    <div className="space-y-4">
      {sel && (
        <Card title={`${sel.shortName} – landed cost trend`} actions={<Button size="sm" variant="ghost" onClick={() => setPid('')}>Close</Button>}>
          {sel.landedHistory?.length ? <TrendChart data={series} type="line" series={[{ key: 'unit', label: 'Container unit landed' }, { key: 'weighted', label: 'Weighted landed (master)' }]} height={240} />
            : <EmptyState icon={Package} title="No containers costed since go-live" message={`Current landed cost ${fmtINR(sel.landedCost)} comes from the opening balance.`} />}
        </Card>
      )}
      <DataTable rows={rows} exportName="product-landed-costs" onRowClick={(r) => setPid(r.id)} searchPlaceholder="Search product…"
        filters={[{ key: 'category', label: 'categories', options: [...new Set(products.map((p) => p.category))] }]}
        columns={[
          { key: 'name', header: 'Product', render: (r) => <ProductCell id={r.id} /> },
          { key: 'base', header: 'Vendor cost (INR)', align: 'right', render: (r) => fmtINR(r.base) },
          { key: 'landed', header: 'Landed (weighted)', align: 'right', render: (r) => <b>{fmtINR(r.landed)}</b> },
          { key: 'last', header: 'Last container', align: 'right', render: (r) => (r.last ? fmtINR(r.last) : '—') },
          { key: 'factor', header: 'Factor', align: 'right', render: (r) => `${r.factor.toFixed(2)}×` },
          { key: 'mrp', header: 'MRP', align: 'right', render: (r) => fmtINR(r.mrp) },
          { key: 'updates', header: 'Costings', align: 'right' },
        ]} />
    </div>
  )
}
