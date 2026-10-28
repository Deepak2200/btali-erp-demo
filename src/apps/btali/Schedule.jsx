import React, { useMemo, useState } from 'react'
import { Truck, PackageSearch, PackageCheck, Printer, Download, Weight, Box, CheckCircle2 } from 'lucide-react'
import { useStore, useLookup } from '../../store'
import { PageHeader, Grid, Stat, Card, Button, Badge, StatusBadge, Modal, EmptyState, Alert, Segmented, toast } from '../../components/ui'
import { PrintArea, DocHeader } from '../../components/business'
import { fmtNum, fmtDate, fmtDateTime, today, addDays, sum, round2, exportCSV, groupBy } from '../../lib/format'
import { scheduleInvoices, scheduleRows, SCHEDULE_COLS, invoiceWeight, invoiceCbm, InvoiceDrawer } from '../erp/dispatch/_shared'

function PickList({ invs, date, onClose }) {
  const state = useStore()
  const rows = scheduleRows(invs, state)
  const byProduct = Object.values(rows.reduce((m, r) => { (m[r.sku] ||= { sku: r.sku, product: r.product, qty: 0, weight: 0 }); m[r.sku].qty += r.qty; m[r.sku].weight += r.weight; return m }, {})).sort((a, b) => a.sku.localeCompare(b.sku))
  const groups = groupBy(rows, 'transporter')
  return (
    <Modal open onClose={onClose} size="lg" title="Pick list" subtitle={`Dispatch date ${fmtDate(date)} · ${invs.length} invoices`}>
      <PrintArea title={`Pick list ${date}`}>
        <DocHeader title="Warehouse pick list" number={`BTALI / ${date}`} date={today()} right={<div className="text-xs text-slate-500">Btali 3PL – Bhiwandi</div>} />
        <div className="text-xs font-semibold uppercase text-slate-500 mb-1">Consolidated picking (by SKU)</div>
        <table className="w-full text-xs border border-slate-200 mb-5">
          <thead className="bg-slate-50"><tr><th className="p-1.5 text-left">SKU</th><th className="p-1.5 text-left">Product</th><th className="p-1.5 text-right">Qty</th><th className="p-1.5 text-right">Kg</th><th className="p-1.5 text-center">Picked ✓</th></tr></thead>
          <tbody>{byProduct.map((p) => <tr key={p.sku} className="border-t border-slate-100"><td className="p-1.5 font-mono">{p.sku}</td><td className="p-1.5">{p.product}</td><td className="p-1.5 text-right">{fmtNum(p.qty)}</td><td className="p-1.5 text-right">{fmtNum(round2(p.weight))}</td><td className="p-1.5 text-center">☐</td></tr>)}</tbody>
        </table>
        {Object.entries(groups).map(([tr, list]) => (
          <div key={tr} className="mb-4">
            <div className="text-xs font-semibold text-slate-800 mb-1">{tr} · {fmtNum(round2(sum(list, (r) => r.weight)))} kg · {fmtNum(round2(sum(list, (r) => r.cbm)))} CBM</div>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-slate-50"><tr><th className="p-1.5 text-left">Invoice</th><th className="p-1.5 text-left">Customer</th><th className="p-1.5 text-left">Product</th><th className="p-1.5 text-right">Qty</th><th className="p-1.5 text-center">Loaded ✓</th></tr></thead>
              <tbody>{list.map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="p-1.5 font-mono">{r.invoice}</td><td className="p-1.5">{r.customer}, {r.city}</td><td className="p-1.5">{r.sku} – {r.product}</td><td className="p-1.5 text-right">{fmtNum(r.qty)}</td><td className="p-1.5 text-center">☐</td></tr>)}</tbody>
            </table>
          </div>
        ))}
        <div className="flex justify-between text-xs text-slate-500 mt-6"><span>Picked by: ____________</span><span>Checked by: ____________</span></div>
      </PrintArea>
    </Modal>
  )
}

export default function BtaliSchedule() {
  const invoices = useStore((s) => s.invoices)
  const products = useStore((s) => s.products)
  const partners = useStore((s) => s.partners)
  const transporters = useStore((s) => s.transporters)
  const schedules = useStore((s) => s.dispatchSchedules || [])
  const setStage = useStore((s) => s.setBtaliStage)
  const { partner, transporter, product } = useLookup()
  const [day, setDay] = useState('TOMORROW')
  const [pick, setPick] = useState(false)
  const [drawer, setDrawer] = useState(null)
  const date = day === 'TODAY' ? today() : addDays(today(), 1)
  const invs = useMemo(() => scheduleInvoices(invoices, date), [invoices, date])
  const groups = useMemo(() => groupBy(invs, (i) => i.transporterId || 'none'), [invs])
  const conf = schedules.find((s) => s.date === date)
  const totals = { qty: sum(invs, (i) => sum(i.lines, (l) => l.qty)), wt: sum(invs, (i) => invoiceWeight(i, products)), cbm: sum(invs, (i) => invoiceCbm(i, products)) }
  const picked = invs.filter((i) => i.btaliStage).length
  const loaded = invs.filter((i) => i.btaliStage === 'LOADED').length

  const exportSheet = () => exportCSV(`Btali-Dispatch-Schedule-${date}.csv`, scheduleRows(invs, { products, partners, transporters }), SCHEDULE_COLS)
  const mark = (inv, stage) => { setStage(inv.id, stage); toast.success(stage === 'LOADED' ? 'Marked loaded' : 'Marked picked', `${inv.number}${stage === 'LOADED' ? ' – upload LR once issued' : ''}`) }
  const markGroup = (list, stage) => { list.forEach((i) => setStage(i.id, stage)); toast.success(`${list.length} invoice${list.length === 1 ? "" : "s"} marked ${stage.toLowerCase()}`) }

  return (
    <div>
      <PageHeader title="Dispatch schedule" subtitle="Auto-built from invoices pushed by Btali Dispatch – pick, load and hand over to transporters"
        actions={<>
          <Segmented value={day} onChange={setDay} options={[{ key: 'TODAY', label: 'Today' }, { key: 'TOMORROW', label: 'Tomorrow' }]} />
          <Button variant="secondary" icon={Download} onClick={exportSheet} disabled={!invs.length}>Export</Button>
          <Button icon={Printer} onClick={() => setPick(true)} disabled={!invs.length}>Print pick list</Button>
        </>} />
      {conf ? <Alert className="mb-4" tone="success" title={`Schedule for ${fmtDate(date)} confirmed by Btali Dispatch`}>Confirmed {fmtDateTime(conf.confirmedAt)} · revision {conf.revision}. New invoices added after confirmation also appear below.</Alert>
        : invs.length > 0 && <Alert className="mb-4" tone="info" title="Provisional schedule">Btali Dispatch has not yet confirmed this schedule – it updates live as invoices are generated.</Alert>}
      <Grid cols={5}>
        <Stat label="Invoices" value={invs.length} icon={Truck} tone="brand" />
        <Stat label="Units" value={fmtNum(totals.qty)} icon={Box} tone="ink" />
        <Stat label="Weight" value={`${fmtNum(Math.round(totals.wt))} kg`} sub={`${fmtNum(round2(totals.cbm))} CBM`} icon={Weight} tone="blue" />
        <Stat label="Picked" value={`${picked} / ${invs.length}`} icon={PackageSearch} tone="amber" />
        <Stat label="Loaded" value={`${loaded} / ${invs.length}`} icon={PackageCheck} tone="green" />
      </Grid>
      {!invs.length ? <Card className="mt-4"><EmptyState icon={CheckCircle2} title="Nothing scheduled" message={`No invoices are due for dispatch by ${fmtDate(date)}.`} /></Card> : (
        <div className="space-y-4 mt-4">
          {Object.entries(groups).map(([tid, list]) => {
            const tr = transporter(tid)
            const wt = sum(list, (i) => invoiceWeight(i, products))
            return (
              <Card key={tid} padded={false} title={<span className="flex items-center gap-2"><Truck className="w-4 h-4 text-brand-500" />{tr?.name || 'Transporter not assigned'}{tr?.isSafex && <Badge tone="violet">Safex pickup</Badge>}</span>}
                subtitle={`${tr?.vehicleNo || ''} · ${tr?.contact || ''} ${tr?.phone || ''} · ${list.length} invoice${list.length === 1 ? "" : "s"} · ${fmtNum(Math.round(wt))} kg`}
                actions={<>
                  <Button size="sm" variant="secondary" disabled={list.every((i) => i.btaliStage)} onClick={() => markGroup(list.filter((i) => !i.btaliStage), 'PICKED')}>Pick all</Button>
                  <Button size="sm" variant="success" disabled={list.every((i) => i.btaliStage === 'LOADED')} onClick={() => markGroup(list.filter((i) => i.btaliStage !== 'LOADED'), 'LOADED')}>Load all</Button>
                </>}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2">Invoice</th><th className="text-left px-4 py-2">Customer</th><th className="text-left px-4 py-2">Items</th><th className="text-right px-4 py-2">Qty</th><th className="text-right px-4 py-2">Kg / CBM</th><th className="text-left px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {list.map((i) => (
                        <tr key={i.id} className={i.btaliStage === 'LOADED' ? 'bg-emerald-50/40' : ''}>
                          <td className="px-4 py-2"><button className="font-mono text-xs text-brand-600 hover:underline" onClick={() => setDrawer(i.id)}>{i.number}</button>{i.type === 'FOC' && <Badge tone="amber" className="ml-1">FOC</Badge>}{i.dispatchDate < date && <div className="text-[10px] text-red-600">carried over from {fmtDate(i.dispatchDate)}</div>}</td>
                          <td className="px-4 py-2"><div className="font-medium text-slate-800">{partner(i.partnerId)?.name}</div><div className="text-[11px] text-slate-500">{partner(i.partnerId)?.city}</div></td>
                          <td className="px-4 py-2 text-xs text-slate-600 max-w-xs">{i.lines.map((l) => `${product(l.productId)?.sku} × ${l.qty}`).join(', ')}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtNum(sum(i.lines, (l) => l.qty))}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-xs">{fmtNum(invoiceWeight(i, products))} / {fmtNum(invoiceCbm(i, products))}</td>
                          <td className="px-4 py-2">{i.btaliStage === 'LOADED' ? <StatusBadge status="DONE" label="Loaded" /> : i.btaliStage === 'PICKED' ? <StatusBadge status="IN_PROGRESS" label="Picked" /> : <StatusBadge status="PENDING" label="To pick" />}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            {!i.btaliStage && <Button size="sm" variant="secondary" onClick={() => mark(i, 'PICKED')}>Picked</Button>}
                            {i.btaliStage === 'PICKED' && <Button size="sm" variant="success" onClick={() => mark(i, 'LOADED')}>Loaded</Button>}
                            {i.btaliStage === 'LOADED' && <span className="text-[11px] text-slate-500">{fmtDateTime(i.loadedAt)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {pick && <PickList invs={invs} date={date} onClose={() => setPick(false)} />}
      {drawer && <InvoiceDrawer invoiceId={drawer} onClose={() => setDrawer(null)} />}
    </div>
  )
}
