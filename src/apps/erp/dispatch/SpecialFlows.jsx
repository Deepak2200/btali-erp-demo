import React, { useMemo, useState } from 'react'
import { Truck, FileText, Download, Factory, Plus, IndianRupee, Receipt, CheckCircle2, Clock, Pencil, PackagePlus, XCircle, Users } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Tabs, Button, Badge, StatusBadge, Switch, Alert, Modal, Field, FormGrid, Input, Select, Textarea, Combobox, NumberInput,
  SearchInput, EmptyState, toast, confirm,
} from '../../../components/ui'
import { PartnerCell, ProductCell, LineItemsEditor } from '../../../components/business'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtNum, fmtDate, daysAgo, daysBetween, sum, round2, exportCSV, monthLabel } from '../../../lib/format'
import { InvoiceDrawer, invoiceWeight } from './_shared'

// ------------------------------------------------------------------ Safex
function SafexTab({ onOpenInvoice }) {
  const s = useStore()
  const raise = useStore((x) => x.raiseSafexDebitNote)
  const setSafex = useStore((x) => x.setPartnerSafex)
  const { partner, transporter } = useLookup()
  const [q, setQ] = useState('')
  const notes = (s.notes || []).filter((n) => n.source === 'SAFEX')
  const jobs = useMemo(() => s.invoices.filter((i) => (i.safex || i.transporterId === 't1') && i.date >= daysAgo(180)).map((i) => ({ ...i, dn: notes.find((n) => n.invoiceId === i.id), weight: invoiceWeight(i, s.products) })), [s.invoices, notes, s.products]) // eslint-disable-line
  const months = useMemo(() => {
    const m = {}
    for (const j of jobs) {
      const k = j.date.slice(0, 7)
      m[k] = m[k] || { month: k, consignments: 0, weight: 0, debitNotes: 0, dnValue: 0, invoiceValue: 0 }
      m[k].consignments++; m[k].weight += j.weight; m[k].invoiceValue += j.total
      if (j.dn) { m[k].debitNotes++; m[k].dnValue += j.dn.total ?? j.dn.amount }
    }
    return Object.values(m).sort((a, b) => (a.month < b.month ? 1 : -1)).map((x) => ({ ...x, id: x.month, weight: round2(x.weight), dnValue: round2(x.dnValue) }))
  }, [jobs])
  const dealers = s.partners.filter((p) => p.type !== 'EXPORT' && p.status === 'ACTIVE' && (!q || `${p.name} ${p.city}`.toLowerCase().includes(q.toLowerCase())))
  const missing = jobs.filter((j) => !j.dn)
  const raiseAll = async () => {
    if (!(await confirm({ title: `Raise ${missing.length} debit notes?`, message: 'Pickup charges are computed at ₹2.5/kg (min ₹300) + GST and emailed to each client.', confirmText: 'Raise debit notes' }))) return
    missing.forEach((j) => raise(j.id))
    toast.success(`${missing.length} debit notes raised`, 'Accounts notified')
  }
  return (
    <div className="space-y-5">
      <Grid cols={4}>
        <Stat label="Safex consignments (180 d)" value={jobs.length} icon={Truck} tone="violet" />
        <Stat label="Debit notes raised" value={notes.length} sub={fmtINR(sum(notes, (n) => n.total ?? n.amount))} icon={FileText} />
        <Stat label="Consignments without debit note" value={missing.length} sub="Safex billing vs ERP debit notes" icon={IndianRupee} tone={missing.length ? 'amber' : 'green'} />
        <Stat label="Safex customers" value={s.partners.filter((p) => p.safex).length} icon={Users} tone="ink" />
      </Grid>
      <Card padded={false} title="Safex dispatch jobs" subtitle="Collected directly from Btali by Safex – segregated from standard transport"
        actions={missing.length > 0 && <Button size="sm" icon={FileText} onClick={raiseAll}>Raise {missing.length} pending debit notes</Button>}>
        <DataTable rows={jobs} onRowClick={(i) => onOpenInvoice(i.id)} exportName="safex-jobs" initialSort={{ key: 'date', dir: 'desc' }} pageSize={8} className="border-0 shadow-none rounded-none"
          filters={[{ key: 'dnstate', label: 'debit note states', value: (j) => (j.dn ? 'Raised' : 'Pending'), options: ['Raised', 'Pending'] }, { key: 'status', label: 'statuses', options: ['ISSUED', 'DISPATCHED'] }]}
          columns={[
            { key: 'number', header: 'Invoice', render: (i) => <span className="font-mono text-xs whitespace-nowrap">{i.number}</span> },
            { key: 'date', header: 'Date', render: (i) => <span className="whitespace-nowrap">{fmtDate(i.date)}</span> },
            { key: 'partner', header: 'Customer', value: (i) => partner(i.partnerId)?.name, render: (i) => <PartnerCell id={i.partnerId} /> },
            { key: 'weight', header: 'Weight', align: 'right', render: (i) => `${fmtNum(i.weight)} kg` },
            { key: 'status', header: 'Pickup', render: (i) => <StatusBadge status={i.status} label={i.status === 'ISSUED' ? 'Awaiting pickup' : 'Picked up'} /> },
            { key: 'dn', header: 'Debit note', value: (i) => i.dn?.number || '', render: (i) => (i.dn ? <span className="text-xs"><span className="font-mono">{i.dn.number}</span> · {fmtINR(i.dn.total ?? i.dn.amount)}</span> : (
              <Button size="sm" variant="soft" onClick={(e) => { e.stopPropagation(); const n = raise(i.id); if (n) toast.success(`Debit note ${n.number} raised`, `${fmtINR(n.total)} emailed to ${partner(i.partnerId)?.name}`) }}>Raise</Button>
            )) },
          ]} />
      </Card>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Safex billing report" subtitle="Monthly – for cost allocation & Safex bill check"
          actions={<Button size="sm" variant="secondary" icon={Download} onClick={() => exportCSV('safex-billing-report.csv', months, [{ header: 'Month', value: (m) => monthLabel(m.month) }, { key: 'consignments', header: 'Consignments' }, { key: 'weight', header: 'Weight (kg)' }, { key: 'invoiceValue', header: 'Invoice value' }, { key: 'debitNotes', header: 'Debit notes' }, { key: 'dnValue', header: 'Debit note value' }])}>Export</Button>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-slate-500"><tr><th className="text-left py-2">Month</th><th className="text-right">Jobs</th><th className="text-right">Weight</th><th className="text-right">Invoice value</th><th className="text-right">Debit notes</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {months.map((m) => (
                  <tr key={m.month}><td className="py-2">{monthLabel(m.month)}</td><td className="text-right tabular-nums">{m.consignments}</td><td className="text-right tabular-nums">{fmtNum(m.weight)} kg</td><td className="text-right tabular-nums">{fmtINR(m.invoiceValue)}</td>
                    <td className="text-right tabular-nums">{m.debitNotes ? fmtINR(m.dnValue) : <span className="text-amber-600">—</span>}</td></tr>
                ))}
              </tbody>
            </table>
            {!months.length && <div className="text-sm text-slate-400 py-6 text-center">No Safex jobs yet.</div>}
          </div>
        </Card>
        <Card title="Safex customers" subtitle="Tag customers whose goods Safex collects – sets Transport Master to Safex" actions={<SearchInput value={q} onChange={setQ} className="w-44" placeholder="Find dealer…" />}>
          <ul className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto -mx-1">
            {dealers.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-1 py-2">
                <div className="flex-1 min-w-0"><PartnerCell id={p.id} sub={`${p.city} · ${transporter(p.transporterId)?.name || '—'}`} /></div>
                {p.safex && <Badge tone="violet">Safex</Badge>}
                <Switch checked={!!p.safex} onChange={(v) => { setSafex(p.id, v); toast.success(v ? `${p.name} tagged as Safex customer` : `Safex tag removed for ${p.name}`) }} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Gujarat
const emptyTransport = { transporterName: '', vehicleNo: '', driver: '', driverPhone: '', notes: '' }
function TransportFields({ t, onChange }) {
  return (
    <FormGrid cols={2}>
      <Field label="Transporter (arranged by client)" required><Input value={t.transporterName} onChange={(e) => onChange({ ...t, transporterName: e.target.value })} placeholder="e.g. Shree Maruti Courier" /></Field>
      <Field label="Vehicle no."><Input value={t.vehicleNo} onChange={(e) => onChange({ ...t, vehicleNo: e.target.value.toUpperCase() })} placeholder="GJ03 AB 1234" /></Field>
      <Field label="Driver name"><Input value={t.driver} onChange={(e) => onChange({ ...t, driver: e.target.value })} /></Field>
      <Field label="Driver phone"><Input value={t.driverPhone} onChange={(e) => onChange({ ...t, driverPhone: e.target.value })} /></Field>
      <Field label="Notes for facility" className="md:col-span-2"><Textarea rows={2} value={t.notes} onChange={(e) => onChange({ ...t, notes: e.target.value })} /></Field>
    </FormGrid>
  )
}

function GujaratTab({ onOpenInvoice }) {
  const s = useStore()
  const createGujaratOrder = useStore((x) => x.createGujaratOrder)
  const updateTransport = useStore((x) => x.updateGujaratTransport)
  const recordReceipt = useStore((x) => x.recordReceipt)
  const createInvoice = useStore((x) => x.createInvoice)
  const delivered = useStore((x) => x.markGujaratDelivered)
  const adjustStock = useStore((x) => x.adjustStock)
  const { partner, product } = useLookup()
  const [newOpen, setNewOpen] = useState(false)
  const [form, setForm] = useState({ partnerId: '', lines: [], transport: emptyTransport })
  const [editT, setEditT] = useState(null)
  const [adj, setAdj] = useState(null)
  const [block, setBlock] = useState(null)
  const guj = s.stock['WH-GUJ'] || {}
  const orders = s.salesOrders.filter((o) => o.warehouseId === 'WH-GUJ')
  const done = orders.filter((o) => o.deliveredAt)
  const tat = done.length ? round2(sum(done, (o) => daysBetween(o.date, o.deliveredAt)) / done.length) : null
  const stockRows = Object.entries(guj).map(([productId, qty]) => ({ id: productId, productId, qty }))

  const create = () => {
    const lines = form.lines.filter((l) => l.productId && l.qty > 0).map((l) => ({ productId: l.productId, qty: l.qty }))
    if (!form.partnerId) return toast.error('Select the customer')
    if (!lines.length) return toast.error('Add at least one item')
    if (!form.transport.transporterName.trim()) return toast.error('Capture the client transporter details')
    const so = createGujaratOrder({ partnerId: form.partnerId, lines, transport: form.transport })
    toast.success(`Order ${so.number} created for Gujarat facility`, 'Order confirmation emailed to client')
    setNewOpen(false)
    setForm({ partnerId: '', lines: [], transport: emptyTransport })
  }
  const pay = async (o) => {
    if (!(await confirm({ title: 'Record advance received?', message: `${fmtINR(o.total)} from ${partner(o.partnerId)?.name} against ${o.number} (NEFT to HDFC current a/c).`, confirmText: 'Record payment' }))) return
    recordReceipt({ soId: o.id, amount: o.total - (o.paidAmount || 0), mode: 'NEFT', ref: `UTR${Date.now().toString().slice(-10)}` })
    toast.success('Advance recorded', `${o.number} ready for facility invoice`)
  }
  const invoice = (o) => {
    const r = createInvoice(o.id, { locationId: 'WH-GUJ', vehicleNo: o.gujTransport?.vehicleNo || '' })
    if (!r.ok) return r.shortages ? setBlock(r) : toast.error(r.error)
    toast.success(`Invoice ${r.invoice.number} generated`, 'Emailed to client · facility notified to deliver')
  }
  const deliver = async (o) => {
    if (!(await confirm({ title: 'Confirm delivery?', message: `Facility has delivered ${o.number} to ${partner(o.partnerId)?.name}.`, confirmText: 'Mark delivered' }))) return
    delivered(o.id)
    toast.success('Delivery recorded', `Turnaround ${daysBetween(o.date, new Date().toISOString().slice(0, 10))} day(s)`)
  }
  const nextAction = (o) => {
    if (o.status === 'CANCELLED') return null
    if (o.paymentStatus !== 'PAID') return <Button size="sm" variant="secondary" icon={IndianRupee} onClick={() => pay(o)}>Record advance</Button>
    if (!o.invoiceId) return <Button size="sm" icon={Receipt} onClick={() => invoice(o)}>Facility invoice</Button>
    if (!o.deliveredAt) return <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => deliver(o)}>Mark delivered</Button>
    return <Badge tone="green">Delivered {fmtDate(o.deliveredAt)}</Badge>
  }
  return (
    <div className="space-y-5">
      <Alert tone="warn" title="Pending client confirmation">Gujarat manufacturing facility is modelled as virtual warehouse WH-GUJ. Purchase raises the SO and invoice; the facility delivers directly using transport arranged by the client. Dispatch tracks for visibility and reporting.</Alert>
      <Grid cols={4}>
        <Stat label="Facility orders" value={orders.length} icon={Factory} />
        <Stat label="In progress" value={orders.filter((o) => !o.deliveredAt && o.status !== 'CANCELLED').length} icon={Clock} tone="amber" />
        <Stat label="Delivered" value={done.length} icon={CheckCircle2} tone="green" />
        <Stat label="Avg turnaround" value={tat != null ? `${tat} days` : '—'} sub="order → delivery" icon={Truck} tone="ink" />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2" padded={false} title="Facility orders & deliveries" actions={<Button size="sm" icon={Plus} onClick={() => setNewOpen(true)}>New facility order</Button>}>
          {orders.length ? (
            <DataTable rows={orders} searchable={false} pageSize={8} className="border-0 shadow-none rounded-none" onRowClick={(o) => o.invoiceId && onOpenInvoice(o.invoiceId)}
              columns={[
                { key: 'number', header: 'Order', render: (o) => <div><div className="font-mono text-xs">{o.number}</div><div className="text-[11px] text-slate-500">{fmtDate(o.date)}</div></div> },
                { key: 'partner', header: 'Customer', value: (o) => partner(o.partnerId)?.name, render: (o) => <PartnerCell id={o.partnerId} /> },
                { key: 'total', header: 'Value', align: 'right', render: (o) => fmtINR(o.total) },
                { key: 'transport', header: 'Client transport', value: (o) => o.gujTransport?.transporterName, render: (o) => (
                  <button className="text-left group" onClick={(e) => { e.stopPropagation(); setEditT({ id: o.id, t: { ...emptyTransport, ...(o.gujTransport || {}) } }) }}>
                    <div className="text-sm text-slate-800 flex items-center gap-1">{o.gujTransport?.transporterName || <span className="text-amber-600">Capture details</span>}<Pencil className="w-3 h-3 text-slate-400 group-hover:text-brand-500" /></div>
                    <div className="text-[11px] text-slate-500">{o.gujTransport?.vehicleNo}</div>
                  </button>
                ) },
                { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
                { key: 'act', header: '', sortable: false, render: (o) => <div onClick={(e) => e.stopPropagation()}>{nextAction(o)}</div> },
              ]} />
          ) : <EmptyState icon={Factory} title="No facility orders yet" action={<Button icon={Plus} onClick={() => setNewOpen(true)}>New facility order</Button>} />}
        </Card>
        <Card title="WH-GUJ virtual stock" subtitle="Gujarat facility, GIDC Metoda – Rajkot" padded={false}>
          <ul className="divide-y divide-slate-100">
            {stockRows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                <div className="flex-1 min-w-0"><ProductCell id={r.productId} /></div>
                <span className="tabular-nums font-semibold">{fmtNum(r.qty)}</span>
                <Button size="sm" variant="ghost" onClick={() => setAdj({ productId: r.productId, qty: 0, reason: 'Facility production update' })}>Adjust</Button>
              </li>
            ))}
          </ul>
          <div className="p-3 border-t border-slate-100"><Button size="sm" variant="secondary" icon={PackagePlus} onClick={() => setAdj({ productId: '', qty: 0, reason: 'Facility production update' })}>Add stock</Button></div>
        </Card>
      </div>

      {newOpen && (
        <Modal open size="lg" onClose={() => setNewOpen(false)} title="New Gujarat facility order" subtitle="SO is raised on WH-GUJ; invoice is generated once advance is received"
          footer={<><Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button><Button icon={Plus} onClick={create}>Create order</Button></>}>
          <Field label="Customer" required>
            <Combobox value={form.partnerId} onChange={(v) => setForm({ ...form, partnerId: v })} placeholder="Select customer…"
              options={s.partners.filter((p) => p.status === 'ACTIVE' && p.type !== 'EXPORT').map((p) => ({ value: p.id, label: p.name, sub: `${p.city}, ${p.state}` }))} />
          </Field>
          <div className="mt-4">{form.partnerId ? <LineItemsEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} partnerId={form.partnerId} productFilter={(p) => guj[p.id] != null} /> : <div className="text-sm text-slate-400">Select the customer to add items available at the facility.</div>}</div>
          <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Transport details collected from client</div>
          <TransportFields t={form.transport} onChange={(transport) => setForm({ ...form, transport })} />
        </Modal>
      )}
      {editT && (
        <Modal open onClose={() => setEditT(null)} title="Client transport details" footer={<><Button variant="secondary" onClick={() => setEditT(null)}>Cancel</Button><Button onClick={() => { if (!editT.t.transporterName.trim()) return toast.error('Transporter name required'); updateTransport(editT.id, editT.t); setEditT(null); toast.success('Transport details saved', 'Shared with Gujarat facility') }}>Save & share with facility</Button></>}>
          <TransportFields t={editT.t} onChange={(t) => setEditT({ ...editT, t })} />
        </Modal>
      )}
      {adj && (
        <Modal open size="sm" onClose={() => setAdj(null)} title="Adjust WH-GUJ stock" footer={<><Button variant="secondary" onClick={() => setAdj(null)}>Cancel</Button><Button onClick={() => { if (!adj.productId || !adj.qty) return toast.error('Select product and quantity'); adjustStock('WH-GUJ', adj.productId, adj.qty, adj.reason, 'WH-GUJ'); toast.success('Facility stock updated', `${product(adj.productId)?.shortName} ${adj.qty > 0 ? '+' : ''}${adj.qty}`); setAdj(null) }}>Save</Button></>}>
          <FormGrid cols={1}>
            <Field label="Product"><Combobox value={adj.productId} onChange={(v) => setAdj({ ...adj, productId: v })} options={s.products.filter((p) => p.type === 'FG' || guj[p.id] != null).map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}` }))} /></Field>
            <Field label="Quantity (+ add / − remove)"><NumberInput value={adj.qty} onChange={(v) => setAdj({ ...adj, qty: v || 0 })} /></Field>
            <Field label="Reason"><Input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></Field>
          </FormGrid>
        </Modal>
      )}
      {block && (
        <Modal open size="sm" onClose={() => setBlock(null)} title="Insufficient stock – invoice cannot be processed" footer={<Button variant="danger" onClick={() => setBlock(null)}>Close</Button>}>
          <div className="flex gap-3"><XCircle className="w-7 h-7 text-red-600 shrink-0" />
            <ul className="space-y-1.5 flex-1">{block.shortages.map((x) => <li key={x.productId} className="border border-red-200 bg-red-50 rounded-lg p-2"><ProductCell id={x.productId} /><div className="text-xs text-red-700 mt-1">Required {x.need} · Facility stock {x.have}</div></li>)}</ul>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default function SpecialFlows() {
  const [tab, setTab] = useState('safex')
  const [inv, setInv] = useState(null)
  return (
    <div className="space-y-5">
      <PageHeader title="Safex & Special Flows" subtitle="Safex direct-pickup transport and the Gujarat facility virtual warehouse" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'safex', label: 'Safex transport' }, { key: 'gujarat', label: 'Gujarat facility' }]} />
      {tab === 'safex' ? <SafexTab onOpenInvoice={setInv} /> : <GujaratTab onOpenInvoice={setInv} />}
      {inv && <InvoiceDrawer invoiceId={inv} onClose={() => setInv(null)} />}
    </div>
  )
}
