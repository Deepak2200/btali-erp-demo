import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CheckCircle2, XCircle, FileInput, Clock, AlertTriangle, Wallet, Pencil, Ship, Send } from 'lucide-react'
import { useStore, useUser, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Tabs, Button, StatusBadge, Badge, Drawer, Modal, FormGrid, Field, Input, NumberInput, Select, Textarea, Combobox,
  FileUpload, AttachmentList, DescriptionList, Timeline, KV, Alert, toast, prompt, confirm,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate, fmtMoney, today, addDays, daysBetween, round2, sum } from '../../../lib/format'
import { BILL_CATEGORIES, TDS_SECTIONS, billPayable, tdsRateFor, panFromGstin, billAccount } from './_books'
import { useBooks, accountLabel } from './_ui'

const STATUS_TABS = [
  { key: 'ALL', label: 'All bills' },
  { key: 'PENDING_BOSS', label: 'Pending Boss' },
  { key: 'APPROVED', label: 'Approved – to pay' },
  { key: 'PAID', label: 'Paid' },
  { key: 'REJECTED', label: 'Rejected' },
]
const defaultCategory = (v) => (!v ? 'OTHER' : v.type === 'CHINA' || (v.type === 'INDIA' && !v.subtype) ? 'SUPPLIER' : v.type === 'FORWARDER' ? 'FREIGHT' : v.type === 'CHA' ? 'CHA' : v.subtype === 'WAREHOUSE' ? 'WAREHOUSE' : 'TRANSPORT')
const defaultTds = (v) => (!v || v.type === 'CHINA' || v.currency !== 'INR' ? '' : v.type === 'INDIA' ? '194Q' : '194C')

export default function VendorBills() {
  const bills = useStore((s) => s.vendorBills) || []
  const approveVendorBill = useStore((s) => s.approveVendorBill)
  const user = useUser()
  const { vendor } = useLookup()
  const [tab, setTab] = useState('ALL')
  const [openId, setOpenId] = useState(null)
  const [form, setForm] = useState(null) // {mode:'new'|'edit', bill}
  const isBoss = user?.role === 'ADMIN'
  const t = today()

  const counts = useMemo(() => Object.fromEntries(STATUS_TABS.map((s) => [s.key, s.key === 'ALL' ? bills.length : bills.filter((b) => b.status === s.key).length])), [bills])
  const rows = useMemo(() => (tab === 'ALL' ? bills : bills.filter((b) => b.status === tab)), [bills, tab])
  const pend = bills.filter((b) => b.status === 'PENDING_BOSS')
  const appr = bills.filter((b) => b.status === 'APPROVED')
  const overdue = appr.filter((b) => b.dueDate < t)
  const paidMonth = bills.filter((b) => b.status === 'PAID' && (b.paidAt || '').slice(0, 7) === t.slice(0, 7))

  const decide = async (b, ok) => {
    const remark = ok ? await prompt({ title: `Approve ${b.number}`, label: 'Remarks (optional)', confirmText: 'Approve & send to Madam' }) : await prompt({ title: `Reject ${b.number}`, label: 'Reason for rejection', required: true, tone: 'danger', confirmText: 'Reject bill' })
    if (remark === null) return
    approveVendorBill(b.id, ok, remark)
    toast.success(ok ? 'Bill approved' : 'Bill rejected', ok ? `${b.number} forwarded to Neha Mehta (Finance Head) for payment` : `${b.number} returned to Accounts`)
  }

  const columns = [
    { key: 'number', header: 'Bill no.', render: (b) => <div><div className="font-medium text-slate-800">{b.number}</div><div className="text-[11px] text-slate-500">{b.vendorRef}</div></div> },
    { key: 'vendor', header: 'Vendor', value: (b) => vendor(b.vendorId)?.name, render: (b) => <div className="min-w-[160px]"><div className="text-slate-800">{vendor(b.vendorId)?.name}</div><div className="text-[11px] text-slate-500">{BILL_CATEGORIES.find((c) => c.value === b.category)?.label}{b.billType !== 'INVOICE' ? ` · ${b.billType.toLowerCase()}` : ''}</div></div> },
    { key: 'date', header: 'Bill date', render: (b) => fmtDate(b.date) },
    { key: 'dueDate', header: 'Due', render: (b) => {
      const d = daysBetween(t, b.dueDate)
      const open = ['APPROVED', 'PENDING_BOSS'].includes(b.status)
      return <div><div className={open && d < 0 ? 'text-red-600 font-medium' : ''}>{fmtDate(b.dueDate)}</div>{open && <div className={`text-[11px] ${d < 0 ? 'text-red-600' : d <= 7 ? 'text-amber-600' : 'text-slate-400'}`}>{d < 0 ? `${-d}d overdue` : d === 0 ? 'due today' : `in ${d}d`}</div>}</div>
    } },
    { key: 'amount', header: 'Bill amount', align: 'right', render: (b) => <div><div>{fmtMoney(b.amount, b.currency)}</div>{b.currency !== 'INR' && <div className="text-[11px] text-slate-400">@ {b.fxRate}</div>}</div> },
    { key: 'net', header: 'Net payable (₹)', align: 'right', value: (b) => billPayable(b), render: (b) => <span className="font-semibold">{fmtINR(billPayable(b))}</span> },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} label={b.status === 'PENDING_BOSS' ? 'Pending Boss' : undefined} /> },
    { key: 'act', header: '', sortable: false, export: false, render: (b) => (b.status === 'PENDING_BOSS' && isBoss ? (
      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => decide(b, true)}>Approve</Button>
        <Button size="sm" variant="secondary" icon={XCircle} onClick={() => decide(b, false)}>Reject</Button>
      </div>
    ) : null) },
  ]

  return (
    <div>
      <PageHeader title="Vendor Bills" subtitle="Supplier, Starex, Safex, GAF, Shiv Sai & CHA invoices · Accounts → Boss approval → Madam payment"
        actions={<Button icon={Plus} onClick={() => setForm({ mode: 'new' })}>New vendor bill</Button>} />
      <Grid cols={4} className="mb-5">
        <Stat icon={Clock} tone="amber" label="Pending Boss approval" value={pend.length} sub={fmtINR(sum(pend, billPayable))} onClick={() => setTab('PENDING_BOSS')} />
        <Stat icon={Wallet} tone="blue" label="Approved – awaiting payment" value={appr.length} sub={fmtINR(sum(appr, billPayable))} onClick={() => setTab('APPROVED')} />
        <Stat icon={AlertTriangle} tone="red" label="Overdue" value={overdue.length} sub={fmtINR(sum(overdue, billPayable))} />
        <Stat icon={CheckCircle2} tone="green" label="Paid this month" value={paidMonth.length} sub={fmtINR(sum(paidMonth, billPayable))} onClick={() => setTab('PAID')} />
      </Grid>
      {isBoss && pend.length > 0 && <Alert tone="warn" className="mb-4" title={`${pend.length} bill(s) need your approval`}>Approve inline below – approved bills move straight to Madam's Payment Dashboard.</Alert>}
      <Tabs tabs={STATUS_TABS.map((s) => ({ ...s, count: counts[s.key] }))} value={tab} onChange={setTab} className="mb-3" />
      <DataTable columns={columns} rows={rows} onRowClick={(b) => setOpenId(b.id)} exportName="vendor-bills" initialSort={{ key: 'date', dir: 'desc' }}
        filters={[{ key: 'category', label: 'categories', options: BILL_CATEGORIES.map((c) => ({ value: c.value, label: c.label })) }, { key: 'vendorId', label: 'vendors', options: [...new Set(bills.map((b) => b.vendorId))].map((id) => ({ value: id, label: vendor(id)?.name || id })) }]}
        rowClass={(b) => (b.status === 'APPROVED' && b.dueDate < t ? 'bg-red-50/40' : '')}
        bulkActions={isBoss ? (sel, clear) => (
          <Button size="sm" variant="success" icon={CheckCircle2} onClick={async () => {
            const p = sel.filter((b) => b.status === 'PENDING_BOSS')
            if (!p.length) return toast.error('Select bills pending your approval')
            if (!(await confirm({ title: `Approve ${p.length} bill(s)?`, message: `Total ${fmtINR(sum(p, billPayable))} will be forwarded to Madam for payment.`, confirmText: 'Approve all' }))) return
            p.forEach((b) => approveVendorBill(b.id, true, 'Bulk approved'))
            clear(); toast.success(`${p.length} bills approved`)
          }}>Approve selected</Button>
        ) : undefined} />
      {openId && <BillDrawer id={openId} onClose={() => setOpenId(null)} onEdit={(b) => { setOpenId(null); setForm({ mode: 'edit', bill: b }) }} decide={decide} isBoss={isBoss} />}
      {form && <BillForm init={form} onClose={() => setForm(null)} />}
    </div>
  )
}

function BillDrawer({ id, onClose, onEdit, decide, isBoss }) {
  const b = useStore((s) => (s.vendorBills || []).find((x) => x.id === id))
  const payments = useStore((s) => s.vendorPayments) || []
  const shipments = useStore((s) => s.shipments)
  const pos = useStore((s) => s.purchaseOrders)
  const { vendor, user } = useLookup()
  const { chart } = useBooks()
  const nav = useNavigate()
  if (!b) return null
  const v = vendor(b.vendorId)
  const sh = shipments.find((x) => x.id === b.shipmentId)
  const po = pos.find((x) => x.id === b.poId)
  const pm = payments.find((x) => x.id === b.paymentId)
  return (
    <Drawer open onClose={onClose} title={`${b.number} · ${v?.name}`} subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={b.status} label={b.status === 'PENDING_BOSS' ? 'Pending Boss' : undefined} /> Vendor ref {b.vendorRef}</span>}
      footer={<>
        {['PENDING_BOSS', 'REJECTED'].includes(b.status) && <Button variant="secondary" icon={Pencil} onClick={() => onEdit(b)}>{b.status === 'REJECTED' ? 'Correct & resubmit' : 'Edit bill'}</Button>}
        {b.status === 'PENDING_BOSS' && isBoss && <><Button variant="secondary" icon={XCircle} onClick={() => decide(b, false)}>Reject</Button><Button variant="success" icon={CheckCircle2} onClick={() => decide(b, true)}>Approve</Button></>}
        {b.status === 'APPROVED' && <Button icon={Send} onClick={() => nav('/erp/accounts/payments')}>Open Payment Dashboard</Button>}
      </>}>
      {b.status === 'REJECTED' && <Alert tone="error" className="mb-4" title="Rejected by Boss">{b.bossRemark}</Alert>}
      <DescriptionList cols={2} items={[
        ['Vendor', <span key="v">{v?.name}<br /><span className="text-xs text-slate-500">{v?.gst ? `GSTIN ${v.gst}` : v?.country} · terms {v?.paymentTerms?.creditDays || 0} days</span></span>],
        ['Category', `${BILL_CATEGORIES.find((c) => c.value === b.category)?.label} → ${accountLabel(chart, billAccount(b, v))}`],
        ['Bill date', fmtDate(b.date)], ['Due date', fmtDate(b.dueDate)],
        ['Purchase order', po ? `${po.number} (${po.status.replace(/_/g, ' ').toLowerCase()})` : '—'],
        ['Shipment', sh ? `${sh.number} · ${sh.containerNo}` : '—'],
        ['Bill type', b.billType], ['Description', b.description],
      ]} />
      {sh && b.category === 'SUPPLIER' && (
        <Alert tone={sh.telexReleased ? 'success' : 'warn'} className="mt-4" title={`ETA ${fmtDate(sh.eta)} · Telex ${sh.telexReleased ? 'released' : 'not released'}`}>
          {sh.telexReleased ? 'Telex release received – goods can be cleared.' : b.billType === 'BALANCE' ? 'Supplier releases telex only after this balance is paid. Pay before ETA to avoid demurrage.' : `Container status: ${sh.status.replace(/_/g, ' ').toLowerCase()}.`}
        </Alert>
      )}
      <Card title="Amounts" className="mt-4">
        {b.currency !== 'INR' && <KV label={`Bill amount (${b.currency})`} value={fmtMoney(b.amount, b.currency)} />}
        {b.currency !== 'INR' && <KV label="Exchange rate (booking)" value={`₹${b.fxRate}`} />}
        <KV label="Taxable value (INR)" value={fmtINR(b.amountINR, true)} />
        <KV label={`GST @ ${b.gstRate || 0}%`} value={fmtINR(b.gst, true)} />
        <KV label={b.tdsSection ? `Less: TDS u/s ${b.tdsSection} @ ${b.tdsRate}%` : 'TDS'} value={b.tds ? `– ${fmtINR(b.tds, true)}` : '—'} />
        <KV label="Net payable to vendor" value={<span className="text-base">{fmtINR(billPayable(b), true)}</span>} className="border-t border-slate-100 mt-1 pt-2" />
        {pm && <KV label={`Paid ${fmtDate(pm.date)} · ${pm.mode} ${pm.ref}`} value={<span className="text-emerald-700">{fmtINR(pm.amountINR, true)}{pm.amountINR !== pm.bookedINR && <span className="block text-[11px] text-slate-500">FX {pm.amountINR > pm.bookedINR ? 'loss' : 'gain'} {fmtINR(Math.abs(pm.amountINR - pm.bookedINR), true)}</span>}</span>} />}
      </Card>
      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Attachments</div>
        <AttachmentList items={b.attachments || []} empty="No invoice copy attached." />
      </div>
      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Approval history</div>
        <Timeline items={(b.history || []).slice().reverse().map((h) => ({ ...h, by: user(h.by)?.name || h.by }))} />
      </div>
    </Drawer>
  )
}

function BillForm({ init, onClose }) {
  const vendors = useStore((s) => s.vendors)
  const pos = useStore((s) => s.purchaseOrders)
  const shipments = useStore((s) => s.shipments)
  const fx = useStore((s) => s.settings.fx)
  const createVendorBill = useStore((s) => s.createVendorBill)
  const updateVendorBill = useStore((s) => s.updateVendorBill)
  const b0 = init.bill
  const [f, setF] = useState(() => b0 ? { ...b0 } : { vendorId: '', vendorRef: '', poId: '', shipmentId: '', billType: 'INVOICE', currency: 'INR', fxRate: 1, amount: '', gstRate: 18, tdsSection: '', tdsRate: 0, date: today(), dueDate: today(), category: 'OTHER', description: '', attachments: [] })
  const [dueTouched, setDueTouched] = useState(!!b0)
  const v = vendors.find((x) => x.id === f.vendorId)
  const set = (patch) => setF((s) => {
    const n = { ...s, ...patch }
    const vv = vendors.find((x) => x.id === n.vendorId)
    if (!dueTouched && ('date' in patch || 'vendorId' in patch || 'billType' in patch)) n.dueDate = addDays(n.date, n.billType === 'ADVANCE' ? 3 : vv?.paymentTerms?.creditDays || 0)
    return n
  })
  const pickVendor = (id) => {
    const vv = vendors.find((x) => x.id === id)
    const sec = defaultTds(vv)
    set({ vendorId: id, currency: vv?.currency || 'INR', fxRate: vv?.currency && vv.currency !== 'INR' ? fx[vv.currency] : 1, category: defaultCategory(vv), gstRate: vv?.currency !== 'INR' || vv?.type === 'CHINA' ? 0 : vv?.subtype === 'PORT_TRANSPORT' ? 0 : vv?.subtype === 'TRANSPORT' ? 12 : 18, tdsSection: sec, tdsRate: sec ? tdsRateFor(sec, panFromGstin(vv?.gst)) : 0, poId: '', shipmentId: '' })
  }
  const vendorPOs = pos.filter((p) => p.vendorId === f.vendorId && !['REJECTED', 'CANCELLED', 'DRAFT'].includes(p.status))
  const poValue = (p) => round2(sum(p.lines, (l) => l.qty * l.rate))
  const pickPO = (id) => {
    const p = pos.find((x) => x.id === id)
    const patch = { poId: id }
    if (p) {
      if (p.shipmentId) patch.shipmentId = p.shipmentId
      const terms = v?.paymentTerms || { advancePct: 0, balancePct: 100 }
      if (f.billType === 'ADVANCE') patch.amount = round2(poValue(p) * terms.advancePct / 100)
      else if (f.billType === 'BALANCE') patch.amount = round2(poValue(p) * terms.balancePct / 100)
      else patch.amount = poValue(p)
      patch.description = f.description || `${f.billType === 'ADVANCE' ? `${terms.advancePct}% advance` : f.billType === 'BALANCE' ? `${terms.balancePct}% balance` : 'Invoice'} against ${p.number}`
    }
    set(patch)
  }
  const amountINR = round2((Number(f.amount) || 0) * (f.currency === 'INR' ? 1 : Number(f.fxRate) || 0))
  const gst = round2(amountINR * (Number(f.gstRate) || 0) / 100)
  const tds = Math.round(amountINR * (f.tdsSection ? Number(f.tdsRate) || 0 : 0) / 100)
  const relevantShipments = shipments.filter((s) => !f.vendorId || ['CHINA'].includes(v?.type) ? s.vendorId === f.vendorId || !f.vendorId : true)

  const save = () => {
    if (!f.vendorId) return toast.error('Select a vendor')
    if (!f.vendorRef.trim()) return toast.error('Vendor invoice number is required')
    if (!(Number(f.amount) > 0)) return toast.error('Enter the bill amount')
    if (f.currency !== 'INR' && !(Number(f.fxRate) > 0)) return toast.error('Enter the exchange rate')
    const payload = { ...f, poId: f.poId || null, shipmentId: f.shipmentId || null, tdsRate: f.tdsSection ? Number(f.tdsRate) : 0 }
    if (init.mode === 'edit') {
      updateVendorBill(b0.id, payload)
      toast.success(b0.status === 'REJECTED' ? 'Bill re-submitted for Boss approval' : 'Bill updated')
    } else {
      const b = createVendorBill(payload)
      toast.success('Bill sent for Boss approval', `${b.number} · net payable ${fmtINR(billPayable(b))}`)
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="lg" title={init.mode === 'edit' ? `Edit ${b0.number}` : 'New vendor bill'} subtitle="Bill is routed to the Director (Boss) for approval, then to Finance Head (Madam) for payment"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={FileInput} onClick={save}>{init.mode === 'edit' && b0.status === 'REJECTED' ? 'Resubmit for approval' : init.mode === 'edit' ? 'Save changes' : 'Submit for approval'}</Button></>}>
      <FormGrid cols={3}>
        <Field label="Vendor" required className="md:col-span-2">
          <Combobox value={f.vendorId} onChange={pickVendor} placeholder="Select vendor…" options={vendors.map((x) => ({ value: x.id, label: x.name, sub: `${x.type}${x.subtype ? ` · ${x.subtype}` : ''} · ${x.currency} · ${x.paymentTerms?.creditDays || 0} days` }))} />
        </Field>
        <Field label="Vendor invoice no." required><Input value={f.vendorRef} onChange={(e) => set({ vendorRef: e.target.value })} placeholder="e.g. STX/BHW/26-27/0951" /></Field>
        <Field label="Bill type"><Select value={f.billType} onChange={(e) => set({ billType: e.target.value })} options={[{ value: 'INVOICE', label: 'Tax invoice' }, { value: 'ADVANCE', label: 'Advance (against PI)' }, { value: 'BALANCE', label: 'Balance (against BL)' }]} /></Field>
        <Field label="Link purchase order"><Select value={f.poId || ''} onChange={(e) => pickPO(e.target.value)} placeholder={vendorPOs.length ? 'None' : 'No open POs'} options={vendorPOs.map((p) => ({ value: p.id, label: `${p.number} · ${p.currency} ${poValue(p).toLocaleString('en-IN')}` }))} /></Field>
        <Field label="Link shipment / container"><Select value={f.shipmentId || ''} onChange={(e) => set({ shipmentId: e.target.value })} placeholder="None" options={relevantShipments.map((s) => ({ value: s.id, label: `${s.number} · ${s.containerNo}` }))} /></Field>
        <Field label="Currency"><Select value={f.currency} onChange={(e) => set({ currency: e.target.value, fxRate: e.target.value === 'INR' ? 1 : fx[e.target.value] })} options={['INR', 'USD', 'CNY']} /></Field>
        <Field label={`Amount (${f.currency})`} required><NumberInput value={f.amount} onChange={(x) => set({ amount: x })} min={0} step="0.01" /></Field>
        <Field label="Exchange rate → INR" hint={f.currency === 'INR' ? 'Not applicable' : `Today's rate ₹${fx[f.currency]}`}><NumberInput value={f.fxRate} onChange={(x) => set({ fxRate: x })} disabled={f.currency === 'INR'} step="0.01" /></Field>
        <Field label="GST rate"><Select value={String(f.gstRate)} onChange={(e) => set({ gstRate: Number(e.target.value) })} options={[0, 5, 12, 18, 28].map((r) => ({ value: String(r), label: r ? `${r}%` : 'Nil / import (IGST at customs)' }))} /></Field>
        <Field label="TDS section"><Select value={f.tdsSection} onChange={(e) => set({ tdsSection: e.target.value, tdsRate: e.target.value ? tdsRateFor(e.target.value, panFromGstin(v?.gst)) : 0 })} placeholder="No TDS" options={TDS_SECTIONS.map((x) => ({ value: x.code, label: x.label }))} /></Field>
        <Field label="TDS rate %"><NumberInput value={f.tdsRate} onChange={(x) => set({ tdsRate: x })} disabled={!f.tdsSection} step="0.1" /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => set({ category: e.target.value })} options={BILL_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} /></Field>
        <Field label="Bill date"><Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Due date" hint={v ? `Auto from terms: ${f.billType === 'ADVANCE' ? 'advance – 3 days' : `${v.paymentTerms?.creditDays || 0} days credit`}` : undefined}><Input type="date" value={f.dueDate} onChange={(e) => { setDueTouched(true); set({ dueDate: e.target.value }) }} /></Field>
        <Field label="Description" className="md:col-span-3"><Textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="What is this bill for?" /></Field>
        <div className="md:col-span-2">
          <Field label="Attach invoice copy"><FileUpload compact onFiles={(a) => set({ attachments: [...(f.attachments || []), ...a.map((x) => ({ ...x, docType: 'INVOICE' }))] })} label="Drop PDF / image of the vendor invoice" /></Field>
          {f.attachments?.length > 0 && <div className="mt-2"><AttachmentList dense items={f.attachments} onRemove={(a) => set({ attachments: f.attachments.filter((x) => x.id !== a.id) })} /></div>}
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-sm">
          <KV label="Taxable (₹)" value={fmtINR(amountINR, true)} />
          <KV label="GST" value={fmtINR(gst, true)} />
          <KV label="TDS" value={tds ? `– ${fmtINR(tds, true)}` : '—'} />
          <KV label="Net payable" value={<span className="text-brand-700">{fmtINR(amountINR + gst - tds, true)}</span>} className="border-t border-slate-200 mt-1" />
        </div>
      </FormGrid>
      {f.shipmentId && <div className="mt-3 text-xs text-slate-500 flex items-center gap-1.5"><Ship className="w-3.5 h-3.5" />Linked bills appear in container costing and the ETA payment board.</div>}
      {v?.note && <Badge tone="blue" className="mt-2">{v.note}</Badge>}
    </Modal>
  )
}
