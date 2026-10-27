import React, { useMemo } from 'react'
import { Download, Timer, Truck, ClipboardCheck, Scale, Calculator, CalendarClock, Ship, PackageCheck, Globe2 } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Grid, Stat, Button, Badge, toast } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { BarsChart } from '../../../components/business'
import { fmtINR, fmtPct, fmtDate, fmtMoney, round2, sum, daysBetween, exportCSV, today } from '../../../lib/format'
import { rfqQuoteINR } from '../../../store/slices/procurement'

const avg = (a) => (a.length ? sum(a) / a.length : 0)
const STD_FACTOR = { FG: 1.28, SPARE: 1.32 }

const useKpis = () => {
  const s = useStore()
  return useMemo(() => {
    const vname = (id) => s.vendors.find((v) => v.id === id)?.name || id
    const fx = s.settings.fx
    // PO cycle time
    const poCycle = s.purchaseOrders.filter((p) => p.approvedAt).map((p) => ({ id: p.id, number: p.number, vendor: vname(p.vendorId), created: p.date, approved: p.approvedAt.slice(0, 10), days: Math.max(0, daysBetween(p.date, p.approvedAt.slice(0, 10))) }))
    // vendor OTD (vendor dispatch milestone vs plan, domestic dispatch vs PO+lead)
    const otdRows = []
    for (const sh of s.shipments) {
      const m = sh.milestones?.find((x) => x.key === 'VENDOR_DISPATCH' && x.done)
      if (m) otdRows.push({ vendorId: sh.vendorId, ref: sh.number, planned: m.planned, actual: m.date, onTime: m.date <= m.planned })
    }
    for (const p of s.purchaseOrders.filter((x) => x.vendorDispatch?.date)) {
      const prod = s.products.find((x) => x.id === p.lines[0]?.productId)
      const planned = new Date(new Date(p.date).getTime() + (prod?.leadTimeDays || 15) * 864e5).toISOString().slice(0, 10)
      otdRows.push({ vendorId: p.vendorId, ref: p.number, planned, actual: p.vendorDispatch.date, onTime: p.vendorDispatch.date <= planned })
    }
    for (const p of s.purchaseOrders.filter((x) => ['IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP'].includes(x.status))) {
      const d = p.deliverySchedule?.[0]
      if (d && d.date < today() && p.status !== 'READY_TO_SHIP') otdRows.push({ vendorId: p.vendorId, ref: p.number, planned: d.date, actual: null, onTime: false })
      else if (d && p.status === 'READY_TO_SHIP') otdRows.push({ vendorId: p.vendorId, ref: p.number, planned: d.date, actual: d.date, onTime: true })
    }
    const vendorIds = [...new Set(otdRows.map((r) => r.vendorId))]
    const otd = vendorIds.map((id) => { const rs = otdRows.filter((r) => r.vendorId === id); return { id, vendor: vname(id), deliveries: rs.length, onTime: rs.filter((r) => r.onTime).length, pct: round2((rs.filter((r) => r.onTime).length / rs.length) * 100) } })
    // QC first-time pass
    const qcPos = s.purchaseOrders.filter((p) => (p.qc || []).length && (p.qc || []).every((q) => q.status !== 'PENDING'))
    const qcRows = qcPos.map((p) => ({ id: p.id, number: p.number, vendor: vname(p.vendorId), files: p.qc.length, rejected: p.qc.filter((q) => q.status === 'REJECTED').length, pass: p.qc.every((q) => q.status === 'APPROVED') }))
    const historicQc = s.purchaseOrders.filter((p) => p.qcApprovedAt && !(p.qc || []).length).length
    const qcPass = (qcRows.filter((r) => r.pass).length + historicQc) / Math.max(1, qcRows.length + historicQc) * 100
    // freight vs benchmark (benchmark = average of quotes received)
    const freight = (s.freightRfqs || []).filter((r) => r.status === 'APPROVED' && r.quotes.length).map((r) => {
      const tots = r.quotes.map((q) => rfqQuoteINR(q, fx))
      const sel = r.quotes.find((q) => q.id === r.selectedQuoteId)
      const bench = avg(tots)
      const paid = sel ? rfqQuoteINR(sel, fx) : bench
      return { id: r.id, number: r.number, route: r.route, date: (r.approvedAt || '').slice(0, 10), forwarder: vname(r.selectedForwarderId), bench: Math.round(bench), paid: Math.round(paid), diffPct: round2(((paid - bench) / bench) * 100) }
    })
    // landed cost variance vs standard forecast
    const landed = s.shipments.filter((x) => x.landedCost?.finalized).map((sh) => {
      const alloc = s.computeLandedAllocation(sh.id, sh.landedCost, sh.landedCost.method)
      const fc = sum(alloc, (a) => { const p = s.products.find((x) => x.id === a.productId); return a.valueINR * STD_FACTOR[p.type] })
      const act = sum(alloc, (a) => a.valueINR + a.allocated)
      return { id: sh.id, number: sh.number, forecast: Math.round(fc), actual: Math.round(act), variance: round2(((act - fc) / fc) * 100) }
    })
    // price list release lead time
    const plLead = (s.priceListVersions || []).filter((v) => v.leadDays != null).map((v) => ({ id: v.id, number: v.number, date: v.date, trigger: v.trigger, days: v.leadDays }))
    // ETA accuracy
    const eta = s.shipments.filter((x) => x.ata).map((x) => ({ id: x.id, number: x.number, eta: x.eta, ata: x.ata, dev: daysBetween(x.eta, x.ata) }))
    // inward discrepancy & GRN lead time
    const recv = s.shipments.filter((x) => x.inward)
    const inward = recv.map((sh) => {
      const expected = sum(s.purchaseOrders.filter((p) => sh.poIds.includes(p.id)), (p) => sum(p.lines, (l) => l.qty))
      const disc = sum(sh.inward.discrepancies || [], (d) => Math.abs(d.received - d.expected))
      const arrival = sh.ata || sh.eta
      return { id: sh.id, number: sh.number, grn: sh.inward.grnNo, expected, disc, pct: expected ? round2((disc / expected) * 100) : 0, lead: Math.max(0, daysBetween(arrival, sh.inward.date)) }
    })
    // exports
    const exp = (s.exportOrders || []).map((o) => {
      const shippedAt = o.legs?.[0]?.milestones?.[2]?.date
      return { id: o.id, number: o.number, customer: s.partners.find((p) => p.id === o.customerId)?.name, status: o.status, value: o.total, margin: round2(o.total - o.cost), marginPct: o.total ? round2(((o.total - o.cost) / o.total) * 100) : 0, cycle: shippedAt ? daysBetween(o.date, shippedAt) : null }
    })
    const legDelay = ['CHINA', 'INDIA', 'DESTINATION'].map((leg) => {
      const ms = (s.exportOrders || []).flatMap((o) => o.legs.filter((l) => l.leg === leg).flatMap((l) => l.milestones.filter((m) => m.done)))
      const late = ms.filter((m) => m.date > m.planned).length
      return { label: leg === 'CHINA' ? 'China leg' : leg === 'INDIA' ? 'India leg' : 'Destination leg', milestones: ms.length, late, pct: ms.length ? round2((late / ms.length) * 100) : 0 }
    })
    return { poCycle, otd, otdRows, qcRows, qcPass, freight, landed, plLead, eta, inward, exp, legDelay }
  }, [s])
}

export default function Reports() {
  const k = useKpis()
  const summary = [
    ['PO cycle time (creation → approval)', `${avg(k.poCycle.map((r) => r.days)).toFixed(1)} days`],
    ['Vendor on-time delivery', fmtPct((sum(k.otd, (r) => r.onTime) / Math.max(1, sum(k.otd, (r) => r.deliveries))) * 100)],
    ['First-time QC pass rate', fmtPct(k.qcPass)],
    ['Freight vs benchmark (avg quote)', fmtPct(avg(k.freight.map((r) => r.diffPct)))],
    ['Landed cost variance vs forecast', fmtPct(avg(k.landed.map((r) => r.variance)))],
    ['Price list release lead time', `${avg(k.plLead.map((r) => r.days)).toFixed(1)} days`],
    ['Container ETA accuracy (±2 days)', fmtPct((k.eta.filter((r) => Math.abs(r.dev) <= 2).length / Math.max(1, k.eta.length)) * 100)],
    ['Inward discrepancy %', fmtPct((sum(k.inward, (r) => r.disc) / Math.max(1, sum(k.inward, (r) => r.expected))) * 100, 2)],
    ['GRN lead time after arrival', `${avg(k.inward.map((r) => r.lead)).toFixed(1)} days`],
    ['Export cycle time (order → shipped)', `${avg(k.exp.filter((r) => r.cycle != null).map((r) => r.cycle)).toFixed(0)} days`],
    ['Export margin (avg)', fmtPct(avg(k.exp.map((r) => r.marginPct)))],
    ['Export freight delay % (all legs)', fmtPct((sum(k.legDelay, (r) => r.late) / Math.max(1, sum(k.legDelay, (r) => r.milestones))) * 100)],
  ]
  const exportAll = () => { exportCSV(`purchase-kpis-${today()}.csv`, summary.map(([kpi, value]) => ({ kpi, value })), [{ header: 'KPI', key: 'kpi' }, { header: 'Value', key: 'value' }]); toast.success('KPI summary exported') }

  return (
    <div>
      <PageHeader title="Purchase Reports" subtitle="Procurement, sales handover, inbound and export KPIs from the Scope of Work" actions={<Button variant="secondary" icon={Download} onClick={exportAll}>Export KPI summary</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="PO cycle time" value={summary[0][1]} icon={Timer} tone="ink" sub="creation → approval" />
        <Stat label="Vendor OTD" value={summary[1][1]} icon={Truck} tone="green" sub={`${k.otdRows.length} deliveries`} />
        <Stat label="First-time QC pass" value={summary[2][1]} icon={ClipboardCheck} tone="blue" />
        <Stat label="Freight vs benchmark" value={summary[3][1]} icon={Scale} tone="brand" sub="negative = below avg quote" />
        <Stat label="Landed cost variance" value={summary[4][1]} icon={Calculator} tone="violet" sub="vs standard factor" />
        <Stat label="Price list lead time" value={summary[5][1]} icon={CalendarClock} tone="amber" sub="after landed cost" />
        <Stat label="ETA accuracy" value={summary[6][1]} icon={Ship} tone="blue" sub="within ±2 days" />
        <Stat label="GRN lead time" value={summary[8][1]} icon={PackageCheck} tone="green" sub={`discrepancy ${summary[7][1]}`} />
      </Grid>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Vendor on-time delivery %" actions={<Csv rows={k.otd} name="vendor-otd" cols={[['vendor', 'Vendor'], ['deliveries', 'Deliveries'], ['onTime', 'On time'], ['pct', 'OTD %']]} />}>
          <BarsChart data={k.otd.map((r) => ({ label: r.vendor.split(' ').slice(0, 2).join(' '), pct: r.pct }))} series={[{ key: 'pct', label: 'OTD %' }]} money={false} height={220} />
        </Card>
        <Card title="Freight paid vs benchmark (INR per container)" actions={<Csv rows={k.freight} name="freight-benchmark" cols={[['number', 'RFQ'], ['route', 'Route'], ['forwarder', 'Forwarder'], ['bench', 'Benchmark'], ['paid', 'Paid'], ['diffPct', 'Diff %']]} />}>
          <BarsChart data={k.freight.map((r) => ({ label: r.number.slice(-7), bench: r.bench, paid: r.paid }))} series={[{ key: 'bench', label: 'Avg quote' }, { key: 'paid', label: 'Selected' }]} height={220} />
        </Card>
        <Card title="Landed cost: forecast vs actual" actions={<Csv rows={k.landed} name="landed-variance" cols={[['number', 'Shipment'], ['forecast', 'Forecast'], ['actual', 'Actual'], ['variance', 'Variance %']]} />}>
          <BarsChart data={k.landed.map((r) => ({ label: r.number, forecast: r.forecast, actual: r.actual }))} series={[{ key: 'forecast', label: 'Forecast (std factor)' }, { key: 'actual', label: 'Actual landed' }]} height={220} />
        </Card>
        <Card title="Export freight delay % per leg" actions={<Csv rows={k.legDelay} name="export-leg-delay" cols={[['label', 'Leg'], ['milestones', 'Milestones'], ['late', 'Late'], ['pct', 'Delay %']]} />}>
          <BarsChart data={k.legDelay} series={[{ key: 'pct', label: 'Delayed milestones %' }]} money={false} height={220} />
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <Section title="PO cycle time" rows={k.poCycle} name="po-cycle-time" cols={[
          { key: 'number', header: 'PO' }, { key: 'vendor', header: 'Vendor' }, { key: 'created', header: 'Created', render: (r) => fmtDate(r.created) }, { key: 'approved', header: 'Approved', render: (r) => fmtDate(r.approved) }, { key: 'days', header: 'Days', align: 'right' },
        ]} />
        <Section title="Container ETA accuracy" rows={k.eta} name="eta-accuracy" cols={[
          { key: 'number', header: 'Shipment' }, { key: 'eta', header: 'ETA', render: (r) => fmtDate(r.eta) }, { key: 'ata', header: 'Actual', render: (r) => fmtDate(r.ata) }, { key: 'dev', header: 'Deviation', align: 'right', render: (r) => <Badge tone={Math.abs(r.dev) <= 2 ? 'green' : 'red'}>{r.dev > 0 ? '+' : ''}{r.dev} d</Badge> },
        ]} />
        <Section title="Inward discrepancy & GRN lead time" rows={k.inward} name="inward-kpi" cols={[
          { key: 'grn', header: 'GRN' }, { key: 'number', header: 'Shipment' }, { key: 'expected', header: 'Expected', align: 'right' }, { key: 'disc', header: 'Discrepant', align: 'right' }, { key: 'pct', header: 'Disc. %', align: 'right', render: (r) => fmtPct(r.pct, 2) }, { key: 'lead', header: 'GRN lead', align: 'right', render: (r) => `${r.lead} d` },
        ]} />
        <Section title="Price list release lead time" rows={k.plLead} name="price-list-lead-time" cols={[
          { key: 'number', header: 'Version' }, { key: 'date', header: 'Released', render: (r) => fmtDate(r.date) }, { key: 'trigger', header: 'Trigger' }, { key: 'days', header: 'Lead', align: 'right', render: (r) => `${r.days} d` },
        ]} />
        <Section title="First-time QC pass" rows={k.qcRows} name="qc-pass" cols={[
          { key: 'number', header: 'PO' }, { key: 'vendor', header: 'Vendor' }, { key: 'files', header: 'QC files', align: 'right' }, { key: 'rejected', header: 'Rejected', align: 'right' }, { key: 'pass', header: 'Result', value: (r) => (r.pass ? 'Pass' : 'Re-work'), render: (r) => <Badge tone={r.pass ? 'green' : 'red'}>{r.pass ? 'First-time pass' : 'Re-work'}</Badge> },
        ]} />
        <Section title="Export orders – cycle time & margin" rows={k.exp} name="export-kpi" cols={[
          { key: 'number', header: 'Order' }, { key: 'customer', header: 'Customer' }, { key: 'value', header: 'Value', align: 'right', render: (r) => fmtMoney(r.value, 'USD') }, { key: 'marginPct', header: 'Margin', align: 'right', render: (r) => `${fmtPct(r.marginPct)} · ${fmtMoney(r.margin, 'USD')}` }, { key: 'cycle', header: 'Order → shipped', align: 'right', render: (r) => (r.cycle != null ? `${r.cycle} d` : 'In progress') },
        ]} />
      </div>
      <Card title="KPI summary" className="mt-4" padded={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 divide-slate-100">
          {[summary.slice(0, 6), summary.slice(6)].map((col, i) => (
            <div key={i} className="divide-y divide-slate-100">{col.map(([kpi, v]) => <div key={kpi} className="flex justify-between px-4 py-2.5 text-sm"><span className="text-slate-600">{kpi}</span><span className="font-semibold tabular-nums">{v}</span></div>)}</div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Csv({ rows, name, cols }) {
  return <Button size="sm" variant="ghost" icon={Download} onClick={() => { exportCSV(`${name}.csv`, rows, cols.map(([key, header]) => ({ key, header }))); toast.success(`${name}.csv downloaded`) }}>CSV</Button>
}
function Section({ title, rows, cols, name }) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-900 mb-2">{title}</div>
      <DataTable rows={rows} columns={cols} searchable={false} exportName={name} pageSize={6} dense />
    </div>
  )
}
