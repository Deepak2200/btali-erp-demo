import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Receipt, XCircle, Truck, FilePlus2 } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Tabs, Button, Badge, StatusBadge, Modal, Field, FormGrid, Input, Select, Checkbox, Alert, toast,
} from '../../../components/ui'
import { PartnerCell, ProductCell } from '../../../components/business'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtNum, fmtDate, sum, daysAgo } from '../../../lib/format'
import { InvoiceDrawer, LRUploadModal, invoiceWeight } from './_shared'

function CreateInvoiceModal({ soId, onClose, onCreated }) {
  const s = useStore()
  const createInvoice = useStore((x) => x.createInvoice)
  const setPartnerTransporter = useStore((x) => x.setPartnerTransporter)
  const { partner, transporter } = useLookup()
  const so = s.salesOrders.find((x) => x.id === soId)
  const p = partner(so?.partnerId)
  const mapped = p?.transporterId || so?.transporterId
  const [f, setF] = useState({ transporterId: so?.transporterId || mapped || '', vehicleNo: transporter(so?.transporterId || mapped)?.vehicleNo || '', locationId: so?.warehouseId || 'WH-BTALI', saveMapping: false })
  const [block, setBlock] = useState(null)
  if (!so) return null
  const loc = f.locationId
  const check = so.lines.map((l) => ({ ...l, have: s.stock[loc]?.[l.productId] || 0 }))
  const overridden = f.transporterId !== mapped
  const submit = () => {
    if (!f.transporterId) return toast.error('Select a transporter')
    const r = createInvoice(so.id, { transporterId: f.transporterId, vehicleNo: f.vehicleNo, locationId: f.locationId })
    if (!r.ok) {
      if (r.shortages?.length) setBlock(r)
      else toast.error('Invoice not created', r.error)
      return
    }
    if (f.saveMapping && overridden) setPartnerTransporter(p.id, f.transporterId)
    toast.success(`Invoice ${r.invoice.number} generated`, `Emailed to ${p.email} · pushed to Btali schedule${r.invoice.safex ? ' · Safex debit note raised' : ''}`)
    onCreated(r.invoice.id)
  }
  return (
    <>
      <Modal open onClose={onClose} size="lg" title={`Create invoice – ${so.number}`} subtitle={`${p?.name} · ${p?.city}, ${p?.state} · ${fmtINR(so.total)}`}
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Receipt} onClick={submit}>Generate invoice</Button></>}>
        <FormGrid cols={3}>
          <Field label="Transporter" required hint={overridden ? `Override – mapped: ${transporter(mapped)?.name || 'none'}` : 'Auto-filled from Transport Master'}>
            <Select value={f.transporterId} onChange={(e) => setF({ ...f, transporterId: e.target.value, vehicleNo: transporter(e.target.value)?.vehicleNo || '' })}
              options={s.transporters.map((t) => ({ value: t.id, label: `${t.name}${t.id === mapped ? ' (mapped)' : ''}${t.isSafex ? ' – direct pickup' : ''}` }))} />
          </Field>
          <Field label="Vehicle no."><Input value={f.vehicleNo} onChange={(e) => setF({ ...f, vehicleNo: e.target.value.toUpperCase() })} /></Field>
          <Field label="Dispatch location">
            <Select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })} options={[{ value: 'WH-BTALI', label: 'Btali 3PL – Bhiwandi' }, { value: 'WH-GUJ', label: 'Gujarat Facility (virtual)' }]} />
          </Field>
        </FormGrid>
        {overridden && <Checkbox className="mt-3" checked={f.saveMapping} onChange={(v) => setF({ ...f, saveMapping: v })} label={`Also update ${p?.name}'s Transport Master to ${transporter(f.transporterId)?.name}`} />}
        {transporter(f.transporterId)?.isSafex && <Alert className="mt-3" tone="info" title="Safex flow">Safex collects directly from the warehouse. A debit note for pickup charges will be raised to the client automatically.</Alert>}
        <div className="mt-4 border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">On hand</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {check.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-2"><ProductCell id={l.productId} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${l.have < l.qty ? 'text-red-600 font-semibold' : 'text-emerald-700'}`}>{fmtNum(l.have)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtINR(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-3">On generation: stock is reduced, the GST invoice is emailed to {p?.email}, and the consignment is pushed to the Btali dispatch schedule for {fmtDate(new Date(Date.now() + 864e5).toISOString())}.</p>
      </Modal>
      {block && (
        <Modal open size="sm" onClose={() => setBlock(null)} title="Insufficient stock – invoice cannot be processed"
          footer={<Button variant="danger" onClick={() => { setBlock(null); onClose() }}>Close</Button>}>
          <div className="flex gap-3">
            <XCircle className="w-8 h-8 text-red-600 shrink-0" />
            <div className="text-sm text-slate-700">
              The following items are short at {loc === 'WH-GUJ' ? 'the Gujarat facility' : 'Btali Bhiwandi'}. Sales has to inform the client or wait for the next inward.
              <ul className="mt-3 space-y-1.5">
                {block.shortages.map((x) => (
                  <li key={x.productId} className="border border-red-200 bg-red-50 rounded-lg px-3 py-2">
                    <ProductCell id={x.productId} />
                    <div className="text-xs text-red-700 mt-1">Required {fmtNum(x.need)} · Available {fmtNum(x.have)} · Short by {fmtNum(x.need - x.have)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export default function Invoices() {
  const s = useStore()
  const { partner, transporter } = useLookup()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('id') ? 'all' : 'ready')
  const [creating, setCreating] = useState(params.get('so'))
  const [openId, setOpenId] = useState(params.get('id'))
  const [lrFor, setLrFor] = useState(null)
  useEffect(() => { if (params.get('id')) { setOpenId(params.get('id')); setTab('all') } if (params.get('so')) setCreating(params.get('so')) }, [params])

  const ready = useMemo(() => s.salesOrders.filter((o) => o.status === 'PAID' && !o.invoiceId && o.warehouseId !== 'WH-GUJ').map((o) => ({
    ...o, short: o.lines.some((l) => (s.stock[o.warehouseId || 'WH-BTALI']?.[l.productId] || 0) < l.qty),
  })), [s.salesOrders, s.stock])
  const all = useMemo(() => s.invoices.filter((i) => i.date >= daysAgo(400)), [s.invoices])
  const close = () => { setOpenId(null); setParams({}) }
  const thisMonth = all.filter((i) => i.date.slice(0, 7) === new Date().toISOString().slice(0, 7))

  return (
    <div className="space-y-5">
      <PageHeader title="Sales Invoices" subtitle="Invoice paid orders – stock-validated, auto-emailed to client and pushed to Btali" />
      <Grid cols={4}>
        <Stat label="Ready to invoice" value={ready.length} sub={fmtINR(sum(ready, (o) => o.total))} icon={FilePlus2} />
        <Stat label="Blocked by stock" value={ready.filter((o) => o.short).length} tone="red" icon={XCircle} />
        <Stat label="Invoiced this month" value={thisMonth.filter((i) => i.type === 'TAX').length} sub={fmtINR(sum(thisMonth, (i) => i.total))} tone="ink" icon={Receipt} />
        <Stat label="Safex consignments (month)" value={thisMonth.filter((i) => i.safex || i.transporterId === 't1').length} tone="violet" icon={Truck} />
      </Grid>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'ready', label: 'Ready to invoice', count: ready.length }, { key: 'all', label: 'All invoices', count: all.length }]} />
      {tab === 'ready' ? (
        <DataTable key="ready" rows={ready} initialSort={{ key: 'date', dir: 'asc' }}
          columns={[
            { key: 'number', header: 'Order', render: (o) => <span className="font-mono text-xs whitespace-nowrap">{o.number}</span> },
            { key: 'date', header: 'Order date', render: (o) => <span className="whitespace-nowrap">{fmtDate(o.date)}</span> },
            { key: 'partner', header: 'Customer', value: (o) => partner(o.partnerId)?.name, render: (o) => <PartnerCell id={o.partnerId} /> },
            { key: 'lines', header: 'Items', value: (o) => sum(o.lines, (l) => l.qty), render: (o) => `${o.lines.length} lines · ${fmtNum(sum(o.lines, (l) => l.qty))} pcs` },
            { key: 'tr', header: 'Mapped transporter', value: (o) => transporter(o.transporterId)?.name, render: (o) => <span className="flex items-center gap-1.5">{transporter(o.transporterId)?.name}{o.transporterId === 't1' && <Badge tone="violet">Safex</Badge>}</span> },
            { key: 'total', header: 'Value', align: 'right', render: (o) => fmtINR(o.total) },
            { key: 'stock', header: 'Stock', value: (o) => (o.short ? 'Short' : 'Available'), render: (o) => o.short ? <Badge tone="red" dot>Short</Badge> : <Badge tone="green" dot>Available</Badge> },
            { key: 'act', header: '', sortable: false, export: false, render: (o) => <Button size="sm" icon={Receipt} onClick={(e) => { e.stopPropagation(); setCreating(o.id) }}>Invoice</Button> },
          ]}
          empty={<div className="text-center text-sm text-slate-500 py-10">No paid orders waiting for invoice.</div>} />
      ) : (
        <DataTable key="all" rows={all} exportName="sales-invoices" onRowClick={(i) => setOpenId(i.id)} initialSort={{ key: 'date', dir: 'desc' }}
          filters={[
            { key: 'status', label: 'statuses', options: [{ value: 'ISSUED', label: 'Issued (awaiting LR)' }, { value: 'DISPATCHED', label: 'Dispatched' }] },
            { key: 'type', label: 'types', options: [{ value: 'TAX', label: 'Tax invoice' }, { value: 'FOC', label: 'FOC' }] },
            { key: 'transporterId', label: 'transporters', options: s.transporters.map((t) => ({ value: t.id, label: t.name })) },
            { key: 'month', label: 'months', value: (i) => i.date.slice(0, 7), options: [...new Set(all.map((i) => i.date.slice(0, 7)))].sort().reverse().slice(0, 12) },
          ]}
          columns={[
            { key: 'number', header: 'Invoice', render: (i) => <span className="font-mono text-xs whitespace-nowrap">{i.number}</span> },
            { key: 'date', header: 'Date', render: (i) => <span className="whitespace-nowrap">{fmtDate(i.date)}</span> },
            { key: 'partner', header: 'Customer', value: (i) => partner(i.partnerId)?.name, render: (i) => <PartnerCell id={i.partnerId} /> },
            { key: 'transporter', header: 'Transporter', value: (i) => transporter(i.transporterId)?.name },
            { key: 'weight', header: 'Weight', align: 'right', value: (i) => invoiceWeight(i, s.products), render: (i) => `${fmtNum(invoiceWeight(i, s.products))} kg` },
            { key: 'total', header: 'Amount', align: 'right', render: (i) => (i.type === 'FOC' ? <Badge tone="amber">FOC</Badge> : fmtINR(i.total)) },
            { key: 'lr', header: 'LR', value: (i) => i.lr?.number || '', render: (i) => i.lr ? <span className="text-xs font-mono">{i.lr.number}</span> : <Badge tone="amber">Awaiting</Badge> },
            { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
          ]} />
      )}
      {creating && <CreateInvoiceModal soId={creating} onClose={() => { setCreating(null); setParams({}) }} onCreated={(id) => { setCreating(null); setTab('all'); setOpenId(id) }} />}
      {openId && <InvoiceDrawer invoiceId={openId} onClose={close} onUploadLR={(id) => setLrFor(id)} />}
      {lrFor && <LRUploadModal invoiceId={lrFor} onClose={() => setLrFor(null)} />}
    </div>
  )
}
