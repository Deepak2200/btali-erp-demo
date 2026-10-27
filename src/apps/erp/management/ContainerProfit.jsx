import React, { useMemo, useState } from 'react'
import { Container, IndianRupee, TrendingUp, Percent, Download, Ship } from 'lucide-react'
import { PageHeader, Card, Grid, Stat, Button, Drawer, DescriptionList, Badge, StatusBadge, Progress, Segmented, Alert } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, BarsChart, CHART_COLORS } from '../../../components/business'
import { profitability, dateRangePresets } from '../../../lib/analytics'
import { fmtINR, fmtCompact, fmtPct, fmtNum, fmtDate, sum, round2, exportCSV } from '../../../lib/format'
import { useAnalyticsState, marginTone } from './_pdKit'

const SOLD = new Set(['INVOICED', 'AT_PARTNER', 'SOLD'])
const CHARGE_KEYS = ['freightINR', 'insurance', 'duty', 'cha', 'portTransport', 'other']
const CHARGE_LABEL = { freightINR: 'Ocean freight', insurance: 'Insurance', duty: 'Customs duty', cha: 'CHA charges', portTransport: 'Port → Starex transport', other: 'Other' }

const buildContainers = (state) => {
  const prof = Object.fromEntries(profitability(state, dateRangePresets()['12M']).map((r) => [r.productId, r]))
  const fx = state.settings.fx || {}
  const soldByPoProduct = {}
  for (const u of state.units || []) {
    if (!SOLD.has(u.status)) continue
    const k = `${u.poId}|${u.productId}`
    soldByPoProduct[k] = (soldByPoProduct[k] || 0) + (u.packQty || 1)
  }
  return (state.shipments || []).map((sh) => {
    const pos = state.purchaseOrders.filter((p) => (sh.poIds || []).includes(p.id))
    const lc = sh.landedCost || {}
    const finalized = !!lc.finalized
    const raw = pos.flatMap((po) => po.lines.map((l) => {
      const p = state.products.find((x) => x.id === l.productId)
      return { poId: po.id, poNumber: po.number, productId: l.productId, product: p, qty: l.qty, valueINR: round2(l.qty * l.rate * (fx[po.currency] || 1)) }
    })).filter((l) => l.product)
    const totValue = sum(raw, (l) => l.valueINR) || 1
    const charges = finalized ? sum(CHARGE_KEYS, (k) => Number(lc[k]) || 0) : 0
    const lines = raw.map((l) => {
      const alloc = finalized ? (lc.allocation || []).find((a) => a.productId === l.productId) : null
      let landed
      if (alloc) landed = round2(alloc.unitLanded * l.qty)
      else if (finalized) landed = round2(l.valueINR + charges * (l.valueINR / totValue))
      else landed = round2(l.qty * l.product.landedCost)
      const pr = prof[l.productId]
      const asp = pr?.avgSellPrice || round2(l.product.mrp * 0.5)
      const revenue = round2(l.qty * asp)
      const soldQty = Math.min(l.qty, soldByPoProduct[`${l.poId}|${l.productId}`] || 0)
      return { ...l, id: `${l.poId}-${l.productId}`, landed, unitLanded: round2(landed / l.qty), asp, aspEstimated: !pr?.avgSellPrice, revenue, margin: round2(revenue - landed), marginPct: revenue ? round2(((revenue - landed) / revenue) * 100) : 0, soldQty, realised: round2(soldQty * asp) }
    })
    const landed = sum(lines, (l) => l.landed)
    const revenue = sum(lines, (l) => l.revenue)
    const realised = sum(lines, (l) => l.realised)
    const qty = sum(lines, (l) => l.qty)
    const soldQty = sum(lines, (l) => l.soldQty)
    return {
      id: sh.id, number: sh.number, containerNo: sh.containerNo, containerType: sh.containerType, vendorId: sh.vendorId,
      vendorName: state.vendors.find((v) => v.id === sh.vendorId)?.name || '—', status: sh.status, etd: sh.etd, eta: sh.eta, ata: sh.ata,
      finalized, method: lc.method, charges: finalized ? Object.fromEntries(CHARGE_KEYS.map((k) => [k, Number(lc[k]) || 0])) : null, igst: Number(lc.igst) || 0,
      fobValue: round2(totValue), landed: round2(landed), revenue: round2(revenue), margin: round2(revenue - landed), marginPct: revenue ? round2(((revenue - landed) / revenue) * 100) : 0,
      realised: round2(realised), realisedPct: revenue ? round2((realised / revenue) * 100) : 0, qty, soldQty, sellThrough: qty ? round2((soldQty / qty) * 100) : 0,
      poNumbers: pos.map((p) => p.number).join(', '), lines,
    }
  })
}

export default function ContainerProfit() {
  const state = useAnalyticsState()
  const target = state.settings.targetMarginPct ?? 12
  const [scope, setScope] = useState('ALL')
  const [openId, setOpenId] = useState(null)
  const all = useMemo(() => buildContainers(state), [state])
  const rows = all.filter((c) => scope === 'ALL' || (scope === 'FINAL' ? c.finalized : !c.finalized))
  const landed = sum(rows, (r) => r.landed)
  const revenue = sum(rows, (r) => r.revenue)
  const realised = sum(rows, (r) => r.realised)
  const open = all.find((c) => c.id === openId)

  const exportAll = () => exportCSV('container-profitability.csv', rows, [
    { header: 'Shipment', key: 'number' }, { header: 'Container', key: 'containerNo' }, { header: 'Type', key: 'containerType' }, { header: 'Supplier', key: 'vendorName' },
    { header: 'POs', key: 'poNumbers' }, { header: 'Status', key: 'status' }, { header: 'ETA', key: 'eta' }, { header: 'Landed cost basis', value: (r) => (r.finalized ? 'Finalised' : 'Estimated') },
    { header: 'FOB value INR', key: 'fobValue' }, { header: 'Landed cost INR', key: 'landed' }, { header: 'Expected revenue INR', key: 'revenue' }, { header: 'Margin INR', key: 'margin' },
    { header: 'Margin %', key: 'marginPct' }, { header: 'Units', key: 'qty' }, { header: 'Units sold', key: 'soldQty' }, { header: 'Revenue realised INR', key: 'realised' },
  ])

  return (
    <div>
      <PageHeader title="Container Profitability" subtitle="Container-wise landed cost vs revenue realisation (12-month average selling prices)"
        actions={<>
          <Segmented size="sm" value={scope} onChange={setScope} options={[{ key: 'ALL', label: 'All containers' }, { key: 'FINAL', label: 'Costs finalised' }, { key: 'EST', label: 'In pipeline' }]} />
          <Button variant="secondary" icon={Download} onClick={exportAll}>Export CSV</Button>
        </>} />
      <Grid cols={4}>
        <Stat label="Containers" value={rows.length} sub={`${rows.filter((r) => r.finalized).length} with finalised landed cost`} icon={Container} tone="ink" />
        <Stat label="Landed cost" value={fmtCompact(landed)} sub={`Avg ${fmtCompact(rows.length ? landed / rows.length : 0)} / container`} icon={Ship} />
        <Stat label="Expected margin" value={fmtCompact(revenue - landed)} sub={`${fmtPct(revenue ? ((revenue - landed) / revenue) * 100 : 0)} on ${fmtCompact(revenue)}`} icon={TrendingUp} tone="green" />
        <Stat label="Revenue realised to date" value={fmtCompact(realised)} sub={`${fmtPct(revenue ? (realised / revenue) * 100 : 0)} of expected`} icon={IndianRupee} tone="blue" />
      </Grid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card className="xl:col-span-2" title="Landed cost vs revenue by container">
          <BarsChart data={rows.map((r) => ({ label: r.number.replace('SH/', ''), landed: r.landed, revenue: r.revenue, realised: r.realised }))} height={280}
            series={[{ key: 'landed', label: 'Landed cost', color: CHART_COLORS[1] }, { key: 'revenue', label: 'Expected revenue', color: CHART_COLORS[0] }, { key: 'realised', label: 'Realised to date', color: CHART_COLORS[2] }]} />
        </Card>
        <Card title="Margin % by container" subtitle={`Target ${target}%`}>
          <div className="space-y-3 mt-1">
            {rows.map((r) => (
              <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="w-full text-left group">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800 group-hover:text-brand-600">{r.number}</span>
                  <span className={`tabular-nums font-semibold ${marginTone(r.marginPct, target)}`}>{fmtPct(r.marginPct)}</span>
                </div>
                <div className="text-[11px] text-slate-500 mb-1 truncate">{r.vendorName} · {r.containerType}</div>
                <Progress value={Math.max(0, r.marginPct)} max={Math.max(60, ...rows.map((x) => x.marginPct))} tone={r.marginPct >= target ? 'green' : 'amber'} />
              </button>
            ))}
            {rows.length === 0 && <div className="text-sm text-slate-400">No containers in this view.</div>}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <DataTable rows={rows} onRowClick={(r) => setOpenId(r.id)} initialSort={{ key: "eta", dir: "desc" }}
          columns={[
            { key: 'number', header: 'Shipment', render: (r) => <div><div className="font-medium text-slate-800 whitespace-nowrap">{r.number}</div><div className="text-[11px] text-slate-500 font-mono whitespace-nowrap">{r.containerNo} · {r.containerType}</div></div> },
            { key: 'vendorName', header: 'Supplier', render: (r) => <div className="max-w-[200px] truncate">{r.vendorName}</div> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'eta', header: 'ETA / ATA', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.ata || r.eta)}</span> },
            { key: 'basis', header: 'Cost basis', value: (r) => (r.finalized ? 'Finalised' : 'Estimated'), render: (r) => (r.finalized ? <Badge tone="green">Finalised</Badge> : <Badge tone="amber">Estimated</Badge>) },
            { key: 'landed', header: 'Landed cost', align: 'right', render: (r) => fmtINR(r.landed) },
            { key: 'revenue', header: 'Expected revenue', align: 'right', render: (r) => fmtINR(r.revenue) },
            { key: 'margin', header: 'Margin', align: 'right', render: (r) => fmtINR(r.margin) },
            { key: 'marginPct', header: 'Margin %', align: 'right', render: (r) => <span className={`font-semibold ${marginTone(r.marginPct, target)}`}>{fmtPct(r.marginPct)}</span> },
            { key: 'sellThrough', header: 'Sell-through', align: 'right', render: (r) => <div className="w-24 ml-auto"><Progress value={r.sellThrough} tone="blue" showLabel /></div> },
          ]} />
      </div>

      <Drawer open={!!open} onClose={() => setOpenId(null)} width="max-w-4xl" title={open ? `${open.number} · ${open.containerNo}` : ''} subtitle={open ? `${open.vendorName} · ${open.containerType} · ${open.poNumbers}` : ''}
        footer={open && <Button variant="secondary" icon={Download} onClick={() => exportCSV(`${open.number.replace(/\//g, '-')}-lines.csv`, open.lines, [
          { header: 'PO', key: 'poNumber' }, { header: 'SKU', value: (l) => l.product.sku }, { header: 'Product', value: (l) => l.product.shortName }, { header: 'Qty', key: 'qty' },
          { header: 'FOB INR', key: 'valueINR' }, { header: 'Landed cost', key: 'landed' }, { header: 'Unit landed', key: 'unitLanded' }, { header: 'Avg selling price', key: 'asp' },
          { header: 'Expected revenue', key: 'revenue' }, { header: 'Margin', key: 'margin' }, { header: 'Margin %', key: 'marginPct' }, { header: 'Sold qty', key: 'soldQty' }, { header: 'Realised', key: 'realised' },
        ])}>Export lines</Button>}>
        {open && (
          <>
            {!open.finalized && <Alert tone="warn" className="mb-4" title="Landed cost not yet finalised">Figures use current weighted landed cost per product. They will update automatically once Purchase finalises customs & landed cost for this container.</Alert>}
            <Grid cols={4}>
              <Stat label="Landed cost" value={fmtCompact(open.landed)} sub={`FOB ${fmtCompact(open.fobValue)}`} />
              <Stat label="Expected revenue" value={fmtCompact(open.revenue)} sub={`${fmtNum(open.qty)} units`} tone="ink" />
              <Stat label="Margin" value={fmtCompact(open.margin)} sub={fmtPct(open.marginPct)} tone={open.marginPct >= target ? 'green' : 'red'} />
              <Stat label="Realised to date" value={fmtCompact(open.realised)} sub={`${fmtNum(open.soldQty)} units sold`} tone="blue" />
            </Grid>
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <Card title="Shipment">
                <DescriptionList items={[
                  ['Status', <StatusBadge key="s" status={open.status} />], ['Container', `${open.containerNo} (${open.containerType})`],
                  ['ETD', fmtDate(open.etd)], ['ETA / ATA', fmtDate(open.ata || open.eta)],
                  ['Allocation method', open.finalized ? (open.method || 'VALUE') : '—'], ['IGST (input credit)', open.igst ? fmtINR(open.igst) : '—'],
                ]} />
              </Card>
              <Card title="Import charges">
                {open.charges ? (
                  <div>
                    {Object.entries(open.charges).map(([k, v]) => <div key={k} className="flex justify-between text-sm py-1"><span className="text-slate-500">{CHARGE_LABEL[k]}</span><span className="tabular-nums">{fmtINR(v)}</span></div>)}
                    <div className="flex justify-between text-sm py-1 border-t border-slate-100 mt-1 font-semibold"><span>Total charges</span><span className="tabular-nums">{fmtINR(sum(Object.values(open.charges)))}</span></div>
                    <div className="text-[11px] text-slate-400 mt-1">Charges add {fmtPct((sum(Object.values(open.charges)) / (open.fobValue || 1)) * 100)} over FOB value.</div>
                  </div>
                ) : <div className="text-sm text-slate-400">Charges are captured when the Bill of Entry and CHA bills are booked.</div>}
              </Card>
            </div>
            <div className="mt-4 border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>{['Product', 'Qty', 'Unit landed', 'Avg sell price', 'Landed cost', 'Revenue', 'Margin %', 'Sold'].map((h, i) => <th key={h} className={`px-3 py-2 ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {open.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2"><ProductCell id={l.productId} sub={l.poNumber} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtINR(l.unitLanded)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtINR(l.asp)}{l.aspEstimated && <span className="text-[10px] text-amber-600 block">at list price</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtINR(l.landed)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtINR(l.revenue)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${marginTone(l.marginPct, target)}`}>{fmtPct(l.marginPct)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtNum(l.soldQty)} / {fmtNum(l.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-slate-400 flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" />Expected revenue = container qty × 12-month average selling price; realised = barcoded units already invoiced or sold.</div>
          </>
        )}
      </Drawer>
    </div>
  )
}
