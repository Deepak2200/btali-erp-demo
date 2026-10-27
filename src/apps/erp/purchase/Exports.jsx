import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Send, Globe2, Wallet, Factory, FileText, Unlock, CheckCircle2, Lock, Trash2, Ship, TrendingUp, Printer, Archive } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Button, IconButton, StatusBadge, Badge, Modal, Drawer, Field, FormGrid, Input, NumberInput, Select, Textarea, Combobox,
  Stepper, Alert, KV, Timeline, DescriptionList, Checkbox, toast, confirm, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, PrintArea, DocHeader } from '../../../components/business'
import { fmtINR, fmtMoney, fmtDate, fmtNum, round2, sum, today, daysBetween } from '../../../lib/format'

const STEPS = [
  { key: 'QUOTED', label: 'Quoted' }, { key: 'ADVANCE_RECEIVED', label: 'Advance' }, { key: 'PO_RELEASED', label: 'Vendor PO' }, { key: 'IN_PRODUCTION', label: 'Production' },
  { key: 'SHIPPED', label: 'Shipped' }, { key: 'DELIVERED', label: 'Delivered' }, { key: 'CLOSED', label: 'Closed' },
]
const LEG_LABEL = { CHINA: 'China forwarder', INDIA: 'Indian forwarder', DESTINATION: 'Destination agent' }
const usd = (v) => fmtMoney(v, 'USD')

export default function Exports() {
  const orders = useStore((s) => s.exportOrders) || []
  const { partner, vendor } = useLookup()
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const open = orders.find((o) => o.id === openId)
  const active = orders.filter((o) => o.status !== 'CLOSED')
  const fxGL = sum(orders, (o) => o.fxGainLoss || 0)
  const margin = sum(orders, (o) => o.total - o.cost)

  return (
    <div>
      <PageHeader title="Direct Export Orders" subtitle="Vendor cost + Btali margin quotes, advance-gated vendor POs, three-leg freight tracking and USD invoicing"
        actions={<Button icon={Plus} onClick={() => setCreating(true)}>New export quote</Button>} />
      <Grid cols={4} className="mb-5">
        <Stat label="Active export orders" value={active.length} icon={Globe2} tone="blue" sub={usd(sum(active, (o) => o.total))} />
        <Stat label="Awaiting advance" value={orders.filter((o) => o.status === 'QUOTED').length} icon={Wallet} tone="amber" sub="vendor PO blocked" />
        <Stat label="Gross margin (all orders)" value={usd(margin)} icon={TrendingUp} tone="green" sub={`≈ ${fmtINR(margin * useStore.getState().settings.fx.USD)}`} />
        <Stat label="Realised FX gain / loss" value={fmtINR(fxGL)} icon={TrendingUp} tone={fxGL >= 0 ? 'green' : 'red'} sub="payment vs quote rate" />
      </Grid>
      <DataTable rows={orders} onRowClick={(o) => setOpenId(o.id)} exportName="export-orders" initialSort={{ key: 'date', dir: 'desc' }}
        filters={[{ key: 'status', label: 'statuses', options: STEPS.map((s) => ({ value: s.key, label: s.label })) }]}
        columns={[
          { key: 'number', header: 'Order', render: (o) => <div><div className="font-medium">{o.number}</div><div className="text-[11px] text-slate-500">{fmtDate(o.date)}</div></div> },
          { key: 'customer', header: 'Customer', value: (o) => partner(o.customerId)?.name, render: (o) => <div><div>{partner(o.customerId)?.name}</div><div className="text-[11px] text-slate-500">{partner(o.customerId)?.country} · {o.incoterm} {o.port}</div></div> },
          { key: 'vendor', header: 'Factory', value: (o) => vendor(o.vendorId)?.name },
          { key: 'total', header: 'Value (USD)', align: 'right', render: (o) => usd(o.total) },
          { key: 'margin', header: 'Margin', align: 'right', value: (o) => o.marginPct, render: (o) => `${o.marginPct}% · ${usd(o.total - o.cost)}` },
          { key: 'paid', header: 'Received', align: 'right', value: (o) => o.paidUSD || 0, render: (o) => <span className={cx(o.fullPaid ? 'text-emerald-700' : o.advanceReceived ? 'text-sky-700' : 'text-amber-700')}>{usd(o.paidUSD || 0)}</span> },
          { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
        ]} />
      {open && <ExportDrawer o={open} onClose={() => setOpenId(null)} />}
      {creating && <CreateExport onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id) }} />}
    </div>
  )
}

function CreateExport({ onClose, onCreated }) {
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const products = useStore((s) => s.products)
  const settings = useStore((s) => s.settings)
  const create = useStore((s) => s.createExportOrder)
  const send = useStore((s) => s.sendExportQuote)
  const customers = partners.filter((p) => p.type === 'EXPORT')
  const [f, setF] = useState({ customerId: customers[0]?.id || '', vendorId: 'v1', marginPct: settings.exportMarginPct, fxRate: settings.fx.USD, advancePct: 30, incoterm: 'CIF', port: '', notes: '', lines: [{ productId: '', qty: 100, vendorCost: '' }], sendNow: true })
  const prodOpts = products.filter((p) => p.vendorId === f.vendorId && p.currency === 'USD').map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: `Vendor rate USD ${p.vendorRate}` }))
  const setLine = (i, patch) => setF((s) => ({ ...s, lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const lines = f.lines.filter((l) => l.productId && l.qty > 0 && l.vendorCost > 0)
  const total = sum(lines, (l) => l.qty * round2(l.vendorCost * (1 + f.marginPct / 100)))
  const save = () => {
    if (!f.customerId || !lines.length) return toast.error('Select a customer and add at least one priced line')
    const o = create({ ...f, lines })
    if (f.sendNow) send(o.id)
    toast.success(`${o.number} created`, f.sendNow ? 'Quotation emailed to customer' : 'Saved as quotation')
    onCreated(o.id)
  }
  return (
    <Modal open onClose={onClose} size="lg" title="New export quotation" subtitle="Price = vendor base cost × (1 + Btali margin)"
      footer={<><span className="mr-auto text-sm self-center">Quote total <b>{usd(total)}</b> <span className="text-slate-500">≈ {fmtINR(total * f.fxRate)}</span></span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} onClick={save}>{f.sendNow ? 'Create & email quote' : 'Create quote'}</Button></>}>
      <FormGrid cols={3}>
        <Field label="Export customer" required><Select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value, port: '' })} options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.country})` }))} /></Field>
        <Field label="China factory" required><Select value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value, lines: [{ productId: '', qty: 100, vendorCost: '' }] })} options={vendors.filter((v) => v.type === 'CHINA').map((v) => ({ value: v.id, label: v.name }))} /></Field>
        <Field label="Btali margin %"><NumberInput min={0} value={f.marginPct} onChange={(v) => setF({ ...f, marginPct: v || 0 })} /></Field>
        <Field label="FX at quote (₹/USD)"><NumberInput step="0.01" value={f.fxRate} onChange={(v) => setF({ ...f, fxRate: v })} /></Field>
        <Field label="Advance %"><NumberInput min={0} max={100} value={f.advancePct} onChange={(v) => setF({ ...f, advancePct: v })} /></Field>
        <Field label="Incoterm / port"><div className="flex gap-2"><Select value={f.incoterm} onChange={(e) => setF({ ...f, incoterm: e.target.value })} options={['FOB', 'CFR', 'CIF']} className="w-24" /><Input value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} placeholder="Destination port" /></div></Field>
      </FormGrid>
      <div className="border border-slate-200 rounded-xl overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2 min-w-[220px]">Product</th><th className="text-right px-3 py-2 w-24">Qty</th><th className="text-right px-3 py-2 w-28">Vendor USD</th><th className="text-right px-3 py-2">Price USD</th><th className="text-right px-3 py-2">Amount</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {f.lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2"><Combobox options={prodOpts} value={l.productId} onChange={(v) => setLine(i, { productId: v, vendorCost: products.find((p) => p.id === v)?.vendorRate })} placeholder="Select product…" /></td>
                <td className="px-3 py-2"><NumberInput min={0} value={l.qty} onChange={(v) => setLine(i, { qty: v })} className="text-right" /></td>
                <td className="px-3 py-2"><NumberInput min={0} step="0.01" value={l.vendorCost} onChange={(v) => setLine(i, { vendorCost: v })} className="text-right" /></td>
                <td className="px-3 py-2 text-right tabular-nums">{l.vendorCost ? usd(round2(l.vendorCost * (1 + f.marginPct / 100))) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{l.vendorCost ? usd(l.qty * round2(l.vendorCost * (1 + f.marginPct / 100))) : '—'}</td>
                <td className="px-1"><IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => setF((s) => ({ ...s, lines: s.lines.filter((_, j) => j !== i) }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200"><Button size="sm" variant="ghost" icon={Plus} onClick={() => setF((s) => ({ ...s, lines: [...s.lines, { productId: '', qty: 100, vendorCost: '' }] }))}>Add line</Button></div>
      </div>
      <Field label="Notes" className="mt-3"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <Checkbox className="mt-3" checked={f.sendNow} onChange={(v) => setF({ ...f, sendNow: v })} label="Email the quotation to the customer now" />
    </Modal>
  )
}

function ExportDrawer({ o, onClose }) {
  const s = useStore()
  const { partner, vendor, product } = useLookup()
  const c = partner(o.customerId)
  const po = s.purchaseOrders.find((p) => p.id === o.poId)
  const [paying, setPaying] = useState(false)
  const [doc, setDoc] = useState(null)
  const paid = o.paidUSD || 0
  const advDue = round2((o.total * o.advancePct) / 100)
  const inrAtQuote = o.total * o.fxRate
  const inrReceived = sum(o.payments || [], (p) => p.amountUSD * p.fxRate)

  const act = async (fn, msg, opts) => {
    if (opts && !(await confirm(opts))) return
    const r = fn()
    if (r && r.ok === false) return toast.error(r.error)
    toast.success(msg)
  }
  return (
    <Drawer open onClose={onClose} width="max-w-5xl" title={`${o.number} · ${c?.name}`} subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={o.status} /> {c?.country} · {o.incoterm} {o.port} · factory {vendor(o.vendorId)?.name}</span>}
      footer={<>
        <Button variant="secondary" icon={Printer} onClick={() => setDoc('quote')}>Quotation</Button>
        {o.status === 'QUOTED' && <Button variant="secondary" icon={Send} onClick={() => act(() => s.sendExportQuote(o.id), 'Quotation re-sent to customer')}>Email quote</Button>}
        {!o.fullPaid && <Button variant="secondary" icon={Wallet} onClick={() => setPaying(true)}>Record payment</Button>}
        {!o.poId && !o.poNumber && <Button icon={Factory} disabled={!o.advanceReceived} title={o.advanceReceived ? '' : 'Advance not received'} onClick={() => act(() => s.releaseExportPO(o.id), 'Vendor PO raised and sent for Director approval', { title: 'Release vendor PO?', message: `A ${vendor(o.vendorId)?.name} PO for ${usd(o.cost)} will be created and routed for approval.`, confirmText: 'Release PO' })}>Release vendor PO</Button>}
        {!o.invoiceNo && (o.poId || o.poNumber) && <Button variant="secondary" icon={FileText} onClick={() => act(() => s.issueExportInvoice(o.id), 'USD invoice issued & emailed')}>Issue USD invoice</Button>}
        {o.invoiceNo && <Button variant="secondary" icon={Printer} onClick={() => setDoc('invoice')}>Invoice</Button>}
        {!o.telexReleased && (o.poId || o.poNumber) && <Button icon={o.fullPaid ? Unlock : Lock} disabled={!o.fullPaid} title={o.fullPaid ? '' : 'Blocked until full payment'} onClick={() => act(() => s.releaseExportTelex(o.id), 'Telex release issued', { title: 'Issue telex release?', message: 'Customer and destination agent will be emailed the telex release.', confirmText: 'Release' })}>Telex release</Button>}
        {o.status === 'DELIVERED' && o.telexReleased && <Button variant="success" icon={Archive} onClick={() => act(() => s.closeExportOrder(o.id), 'Order closed')}>Close order</Button>}
      </>}>
      <Stepper steps={STEPS} current={o.status} className="mb-4" />
      {!o.advanceReceived && <Alert tone="warn" className="mb-4" title={`Advance of ${usd(advDue)} (${o.advancePct}%) pending`}>The vendor PO cannot be released until the customer advance is received.</Alert>}
      {o.advanceReceived && !o.fullPaid && (o.poId || o.poNumber) && <Alert tone="info" className="mb-4" title="Telex release locked">Balance {usd(o.total - paid)} must be received before the telex release is issued.</Alert>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Order" className="lg:col-span-2" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Vendor cost</th><th className="text-right px-3 py-2">Price</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {o.lines.map((l) => <tr key={l.productId}><td className="px-3 py-2"><ProductCell id={l.productId} /></td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td><td className="px-3 py-2 text-right tabular-nums text-slate-500">{usd(l.vendorCost)}</td><td className="px-3 py-2 text-right tabular-nums">{usd(l.price)}</td><td className="px-3 py-2 text-right tabular-nums font-medium">{usd(l.qty * l.price)}</td></tr>)}
              </tbody>
              <tfoot className="bg-slate-50 text-sm">
                <tr><td colSpan={4} className="px-3 py-1.5 text-right text-slate-500">Vendor cost</td><td className="px-3 py-1.5 text-right tabular-nums">{usd(o.cost)}</td></tr>
                <tr><td colSpan={4} className="px-3 py-1.5 text-right text-slate-500">Btali margin ({o.marginPct}%)</td><td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{usd(o.total - o.cost)}</td></tr>
                <tr className="font-bold"><td colSpan={4} className="px-3 py-1.5 text-right">Order value</td><td className="px-3 py-1.5 text-right tabular-nums">{usd(o.total)}</td></tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <Card title="FX invoice (USD)">
          <KV label="Invoice" value={o.invoiceNo || 'Not issued'} />
          <KV label="Quote rate" value={`₹${o.fxRate}`} />
          <KV label="INR at quote" value={fmtINR(inrAtQuote)} />
          <div className="border-t border-slate-100 my-2" />
          {(o.payments || []).map((p) => <KV key={p.id} label={`${p.kind === 'ADVANCE' ? 'Advance' : 'Balance'} ${fmtDate(p.date)} @ ₹${p.fxRate}`} value={<span>{usd(p.amountUSD)}<span className="block text-[11px] text-slate-500 font-normal">{fmtINR(p.amountUSD * p.fxRate)}</span></span>} />)}
          {!(o.payments || []).length && <div className="text-sm text-slate-400 py-1">No payments yet</div>}
          <div className="border-t border-slate-100 my-2" />
          <KV label="Received" value={`${usd(paid)} of ${usd(o.total)}`} />
          <KV label="INR realised" value={fmtINR(inrReceived)} />
          <KV label="FX gain / loss" value={<span className={cx((o.fxGainLoss || 0) >= 0 ? 'text-emerald-700' : 'text-red-600')}>{(o.fxGainLoss || 0) >= 0 ? '+' : ''}{fmtINR(o.fxGainLoss || 0)}</span>} />
        </Card>
      </div>

      <Card title="Shipment legs" subtitle="China forwarder → Indian forwarder → destination agent" className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {o.legs.map((leg, li) => {
            const done = leg.milestones.filter((m) => m.done).length
            return (
              <div key={leg.leg} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LEG_LABEL[leg.leg]}</span><Badge tone={done === leg.milestones.length ? 'green' : done ? 'blue' : 'gray'}>{done}/{leg.milestones.length}</Badge></div>
                <div className="text-sm font-medium text-slate-800 mt-1">{vendor(leg.forwarderId)?.name}</div>
                <ul className="mt-3 space-y-2">
                  {leg.milestones.map((m, mi) => {
                    const late = m.done ? daysBetween(m.planned, m.date) : daysBetween(m.planned, today())
                    const canEdit = !!(o.poId || o.poNumber) && o.status !== 'CLOSED'
                    return (
                      <li key={mi} className="flex items-start gap-2">
                        <input type="checkbox" disabled={!canEdit} checked={m.done} onChange={(e) => { s.updateExportMilestone(o.id, li, mi, e.target.checked); toast.success(e.target.checked ? `${m.label} – done` : 'Milestone reopened') }} className="mt-0.5 w-4 h-4 accent-[#f2541f]" />
                        <div className="min-w-0">
                          <div className={cx('text-sm', m.done ? 'text-slate-800' : 'text-slate-600')}>{m.label}</div>
                          <div className="text-[11px] text-slate-400">Plan {fmtDate(m.planned)}{m.done ? ` · done ${fmtDate(m.date)}` : ''}{late > 0 && (m.done || m.planned < today()) ? <span className="text-red-600"> · {late} d late</span> : ''}</div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
        {!(o.poId || o.poNumber) && <p className="text-xs text-slate-500 mt-3">Milestones open for update once the vendor PO is released.</p>}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card title="Details">
          <DescriptionList items={[
            ['Customer', `${c?.name}, ${c?.city}`], ['Contact', `${c?.contact} · ${c?.email}`],
            ['Vendor PO', po ? <Link className="text-brand-600 hover:underline" to={`/erp/purchase/orders/${po.id}`}>{po.number} ({po.status.replace(/_/g, ' ').toLowerCase()})</Link> : o.poNumber || 'Not released'],
            ['Telex', o.telexReleased ? `Released ${fmtDate(o.telexAt)}` : 'Not released'], ['Quote sent', o.quoteSentAt ? fmtDate(o.quoteSentAt) : '—'], ['Cycle time', `${daysBetween(o.date, o.closedAt || today())} days`],
          ]} />
          {o.notes && <p className="text-sm text-slate-600 mt-3">{o.notes}</p>}
        </Card>
        <Card title="Activity"><Timeline items={[...o.timeline].reverse()} /></Card>
      </div>
      {paying && <PaymentModal o={o} onClose={() => setPaying(false)} />}
      {doc && <DocModal o={o} kind={doc} onClose={() => setDoc(null)} />}
    </Drawer>
  )
}

function PaymentModal({ o, onClose }) {
  const record = useStore((s) => s.recordExportPayment)
  const fx = useStore((s) => s.settings.fx.USD)
  const paid = o.paidUSD || 0
  const advDue = Math.max(0, round2((o.total * o.advancePct) / 100 - paid))
  const [f, setF] = useState({ amountUSD: o.advanceReceived ? round2(o.total - paid) : advDue, fxRate: fx, ref: '', date: today() })
  const save = () => {
    if (!(f.amountUSD > 0) || !(f.fxRate > 0)) return toast.error('Enter amount and FX rate')
    if (f.amountUSD > o.total - paid + 0.5) return toast.error('Amount exceeds the outstanding balance')
    record(o.id, f)
    toast.success('Payment recorded', `FX ${f.fxRate > o.fxRate ? 'gain' : f.fxRate < o.fxRate ? 'loss' : 'neutral'} vs quote rate ₹${o.fxRate}`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="sm" title="Record customer payment" subtitle={`${o.number} · outstanding ${usd(o.total - paid)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Record</Button></>}>
      <FormGrid>
        <Field label="Amount (USD)" required><NumberInput step="0.01" value={f.amountUSD} onChange={(v) => setF({ ...f, amountUSD: v })} /></Field>
        <Field label="Realised rate (₹/USD)" required><NumberInput step="0.01" value={f.fxRate} onChange={(v) => setF({ ...f, fxRate: v })} /></Field>
        <Field label="SWIFT / bank ref"><Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
        <Field label="Value date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </FormGrid>
      <p className="text-xs text-slate-500 mt-3">INR credited {fmtINR((f.amountUSD || 0) * (f.fxRate || 0))} · at quote rate {fmtINR((f.amountUSD || 0) * o.fxRate)}</p>
    </Modal>
  )
}

function DocModal({ o, kind, onClose }) {
  const { partner, product } = useLookup()
  const c = partner(o.customerId)
  return (
    <Modal open onClose={onClose} size="lg" title={kind === 'invoice' ? 'Export commercial invoice' : 'Export quotation'}>
      <PrintArea title={kind === 'invoice' ? o.invoiceNo : o.number}>
        <DocHeader title={kind === 'invoice' ? 'Commercial Invoice' : 'Quotation'} number={kind === 'invoice' ? o.invoiceNo : o.number} date={kind === 'invoice' ? o.invoiceDate : o.date} right={<div className="text-xs text-slate-500">Currency: USD · {o.incoterm} {o.port}</div>} />
        <div className="text-sm mb-4"><div className="text-xs text-slate-500">Bill to</div><div className="font-semibold">{c?.name}</div><div className="text-slate-600">{c?.city}, {c?.country} · {c?.contact}</div></div>
        <table className="w-full text-sm border border-slate-200">
          <thead className="bg-slate-50 text-xs"><tr><th className="text-left p-2">Description</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Unit USD</th><th className="text-right p-2">Amount USD</th></tr></thead>
          <tbody>{o.lines.map((l) => <tr key={l.productId} className="border-t border-slate-100"><td className="p-2">{product(l.productId)?.name} <span className="text-slate-400">({product(l.productId)?.sku})</span></td><td className="p-2 text-right">{fmtNum(l.qty)}</td><td className="p-2 text-right">{usd(l.price)}</td><td className="p-2 text-right">{usd(l.qty * l.price)}</td></tr>)}</tbody>
          <tfoot><tr className="border-t border-slate-200 font-bold"><td colSpan={3} className="p-2 text-right">Total ({o.incoterm})</td><td className="p-2 text-right">{usd(o.total)}</td></tr></tfoot>
        </table>
        <p className="text-xs text-slate-500 mt-4">Payment terms: {o.advancePct}% advance before factory order; balance before telex release. Bank: HDFC Bank, Turbhe – SWIFT HDFCINBBXXX.</p>
      </PrintArea>
    </Modal>
  )
}
