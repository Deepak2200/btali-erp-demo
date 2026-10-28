import React, { useEffect, useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import JSZip from 'jszip'
import {
  Plus, CheckCircle2, XCircle, Send, Printer, FileText, Truck, PackageCheck, Lock, Tag, Barcode as BarcodeIcon, Camera, Download, Ban,
  ArrowLeft, Stamp, Mail, CalendarPlus, Wallet, Ship, AlertTriangle,
} from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Card, Button, Tabs, Select, Modal, Field, FormGrid, Input, NumberInput, Textarea, Checkbox, Badge, StatusBadge, Stepper,
  DescriptionList, Timeline, AttachmentList, FileUpload, Alert, EmptyState, toast, confirm, prompt, KV, SectionTitle, Grid, Stat,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { LineItemsEditor, ProductCell, PrintArea, DocHeader, VendorName, UserName } from '../../../components/business'
import { fmtMoney, fmtINR, fmtDate, fmtNum, fmtDateTime, sum, today, addDays, round2, exportCSV, downloadBlob, daysBetween, fmtCompact } from '../../../lib/format'
import { PO_FLOW, DOMESTIC_FLOW, PO_STATUSES, poValue, poValueINR, paymentSchedule, useCanEdit } from './_purchaseKit'

export default function Orders() {
  return (
    <Routes>
      <Route index element={<OrderList />} />
      <Route path=":id" element={<OrderDetail />} />
    </Routes>
  )
}

// ====================================================================== LIST
function OrderList() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const pos = useStore((s) => s.purchaseOrders)
  const vendors = useStore((s) => s.vendors)
  const fx = useStore((s) => s.settings.fx)
  const { canEdit } = useCanEdit()
  const type = sp.get('type') || 'ALL'
  const status = sp.get('status') || ''
  const vendor = sp.get('vendor') || ''
  const setParam = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete('new'); setSp(n, { replace: true }) }
  const newOpen = sp.get('new') === '1'

  const rows = useMemo(() => pos.filter((p) => (type === 'ALL' || p.type === type) && (!status || p.status === status) && (!vendor || p.vendorId === vendor))
    .map((p) => ({ ...p, value: poValue(p), valueINR: poValueINR(p, fx), vendorName: vendors.find((v) => v.id === p.vendorId)?.name })), [pos, type, status, vendor, fx, vendors])

  const count = (t) => pos.filter((p) => t === 'ALL' || p.type === t).length
  const columns = [
    { key: 'number', header: 'PO No.', render: (r) => <span className="font-mono font-medium text-brand-700">{r.number}</span> },
    { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
    { key: 'vendorName', header: 'Vendor', render: (r) => <div className="min-w-0"><div className="text-sm text-slate-800 truncate max-w-[220px]">{r.vendorName}</div><div className="text-[11px] text-slate-500">{r.lines.length} lines · {fmtNum(sum(r.lines, (l) => l.qty))} units</div></div> },
    { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'IMPORT' ? 'blue' : r.type === 'DOMESTIC' ? 'teal' : 'violet'}>{r.type}</Badge> },
    { key: 'value', header: 'Value', align: 'right', render: (r) => fmtMoney(r.value, r.currency) },
    { key: 'valueINR', header: 'Value (INR)', align: 'right', render: (r) => fmtINR(r.valueINR) },
    { key: 'checks', header: 'PI · MRP · Barcode · QC', sortable: false, export: false, render: (r) => (
      <div className="flex gap-1">
        {[['PI', r.pi?.status === 'APPROVED'], ['MRP', r.mrpConfirmed], ['BC', r.barcodesGenerated], ['QC', !!r.qcApprovedAt]].map(([l, ok]) => (
          <span key={l} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{l}</span>
        ))}
      </div>
    ) },
    { key: 'source', header: 'Source', render: (r) => <span className="text-xs text-slate-500">{(r.source || 'MANUAL').replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle="Import, domestic and export-linked POs with approval, PI, MRP, QC and shipment tracking"
        actions={canEdit && <Button icon={Plus} onClick={() => setSp({ ...Object.fromEntries(sp), new: '1' })}>New PO</Button>} />
      <Tabs className="mb-4" value={type} onChange={(v) => setParam('type', v === 'ALL' ? '' : v)}
        tabs={[{ key: 'ALL', label: 'All', count: count('ALL') }, { key: 'IMPORT', label: 'Import (China)', count: count('IMPORT') }, { key: 'DOMESTIC', label: 'Domestic', count: count('DOMESTIC') }, { key: 'EXPORT', label: 'Export-linked', count: count('EXPORT') }]} />
      <DataTable columns={columns} rows={rows} onRowClick={(r) => nav(r.id)} exportName="purchase-orders" initialSort={{ key: 'date', dir: 'desc' }}
        toolbar={<>
          <Select value={status} onChange={(e) => setParam('status', e.target.value)} placeholder="All statuses" options={PO_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }))} className="sm:w-44" />
          <Select value={vendor} onChange={(e) => setParam('vendor', e.target.value)} placeholder="All vendors" options={vendors.filter((v) => ['CHINA', 'INDIA'].includes(v.type)).map((v) => ({ value: v.id, label: v.name }))} className="sm:w-52" />
        </>} />
      {newOpen && <NewPOModal onClose={() => setParam('new', '')} onCreated={(po) => nav(po.id)} />}
    </div>
  )
}

// ====================================================================== NEW PO
function NewPOModal({ onClose, onCreated }) {
  const vendors = useStore((s) => s.vendors)
  const products = useStore((s) => s.products)
  const salesOrders = useStore((s) => s.salesOrders)
  const partners = useStore((s) => s.partners)
  const exportOrders = useStore((s) => s.exportOrders || [])
  const createPO = useStore((s) => s.createPO)
  const addDeliverySchedule = useStore((s) => s.addDeliverySchedule)
  const [type, setType] = useState('IMPORT')
  const [vendorId, setVendorId] = useState('')
  const [lines, setLines] = useState([{ productId: '', qty: 1 }])
  const [terms, setTerms] = useState({ advancePct: 0, balancePct: 100, creditDays: 0 })
  const [reqPay, setReqPay] = useState(false)
  const [soId, setSoId] = useState('')
  const [expId, setExpId] = useState('')
  const [delivery, setDelivery] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const vlist = vendors.filter((v) => (type === 'DOMESTIC' ? v.type === 'INDIA' : v.type === 'CHINA'))
  const vendor = vendors.find((v) => v.id === vendorId)
  useEffect(() => { if (vendor) { setTerms({ ...vendor.paymentTerms }); setDelivery(addDays(today(), type === 'DOMESTIC' ? 15 : 60)) } }, [vendorId]) // eslint-disable-line
  useEffect(() => { setVendorId(''); setLines([{ productId: '', qty: 1 }]) }, [type])
  const openSOs = salesOrders.filter((s) => ['CONFIRMED', 'PAID', 'PENDING_REVIEW'].includes(s.status) && !s.history)
  const valid = lines.filter((l) => l.productId && l.qty > 0)
  const moqWarn = valid.map((l) => ({ l, p: products.find((p) => p.id === l.productId) })).filter(({ l, p }) => l.qty < p.moq)

  const save = (draft) => {
    if (!vendorId) return setErr('Select a vendor')
    if (!valid.length) return setErr('Add at least one product line with quantity')
    if (reqPay && !soId) return setErr('Link the customer sales order that must be paid first')
    if (Number(terms.advancePct) + Number(terms.balancePct) !== 100) return setErr('Advance % + balance % must equal 100')
    const po = createPO({
      type, vendorId, draft, note, source: 'MANUAL', paymentTerms: { advancePct: Number(terms.advancePct), balancePct: Number(terms.balancePct), creditDays: Number(terms.creditDays) },
      lines: valid.map((l) => { const p = products.find((x) => x.id === l.productId); return { productId: l.productId, qty: Number(l.qty), rate: Number(l.rate ?? p.vendorRate), mrp: p.mrp } }),
      requiresCustomerPayment: type === 'DOMESTIC' && reqPay, linkedSoId: type === 'DOMESTIC' && soId ? soId : null, exportOrderId: type === 'EXPORT' ? expId || null : null,
    })
    if (delivery) addDeliverySchedule(po.id, { date: delivery, qty: sum(valid, (l) => l.qty), note: 'Requested delivery' })
    toast.success(draft ? `${po.number} saved as draft` : `${po.number} sent for Director approval`)
    onCreated(po)
  }

  return (
    <Modal open onClose={onClose} size="xl" title="New purchase order" subtitle="Vendor terms, rates and MOQ are pre-filled from the masters"
      footer={<>
        {err && <span className="text-sm text-red-600 mr-auto self-center">{err}</span>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="soft" onClick={() => save(true)}>Save draft</Button>
        <Button icon={Send} onClick={() => save(false)}>Submit for approval</Button>
      </>}>
      <div className="space-y-4">
        <FormGrid cols={3}>
          <Field label="PO type" required>
            <Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: 'IMPORT', label: 'Import – China vendor' }, { value: 'DOMESTIC', label: 'Domestic – Indian vendor' }, { value: 'EXPORT', label: 'Export order (back-to-back)' }]} />
          </Field>
          <Field label="Vendor" required className="md:col-span-2">
            <Select value={vendorId} onChange={(e) => { setVendorId(e.target.value); setLines([{ productId: '', qty: 1 }]); setErr('') }} placeholder="Select vendor…" options={vlist.map((v) => ({ value: v.id, label: `${v.name} (${v.city}) · ${v.currency}` }))} />
          </Field>
        </FormGrid>
        {vendor && (
          <>
            <LineItemsEditor mode="vendor" vendorId={vendorId} currency={vendor.currency} lines={lines} onChange={setLines} showStock />
            {moqWarn.length > 0 && <Alert tone="warn" title="Below vendor MOQ">{moqWarn.map(({ l, p }) => `${p.shortName}: ${l.qty} < MOQ ${p.moq}`).join(' · ')}. The vendor may revise the PI rate.</Alert>}
            <FormGrid cols={4}>
              <Field label="Advance %"><NumberInput value={terms.advancePct} onChange={(v) => setTerms((t) => ({ ...t, advancePct: v, balancePct: 100 - (Number(v) || 0) }))} /></Field>
              <Field label="Balance %"><NumberInput value={terms.balancePct} onChange={(v) => setTerms((t) => ({ ...t, balancePct: v }))} /></Field>
              <Field label="Credit days"><NumberInput value={terms.creditDays} onChange={(v) => setTerms((t) => ({ ...t, creditDays: v }))} /></Field>
              <Field label="Required delivery"><Input type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} /></Field>
            </FormGrid>
            {type === 'DOMESTIC' && (
              <div className="border border-teal-200 bg-teal-50/50 rounded-xl p-3 space-y-3">
                <Checkbox checked={reqPay} onChange={setReqPay} label="Requires customer payment before vendor dispatch (back-to-back order)" />
                {reqPay && (
                  <Field label="Linked customer sales order" required hint="Vendor dispatch stays locked until Accounts records full payment on this order">
                    <Select value={soId} onChange={(e) => setSoId(e.target.value)} placeholder="Select sales order…" options={openSOs.map((s) => ({ value: s.id, label: `${s.number} · ${partners.find((p) => p.id === s.partnerId)?.name} · ${fmtINR(s.total)} · ${s.paymentStatus}` }))} />
                  </Field>
                )}
              </div>
            )}
            {type === 'EXPORT' && (
              <Field label="Export order" hint="Advance must be received before the vendor PO is released">
                <Select value={expId} onChange={(e) => setExpId(e.target.value)} placeholder={exportOrders.length ? 'Select export order…' : 'No export orders open'} options={exportOrders.map((x) => ({ value: x.id, label: `${x.number} · ${partners.find((p) => p.id === x.customerId)?.name || ''}` }))} />
              </Field>
            )}
            <Field label="Note to approver / vendor"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Consolidated for 15th cycle; pack spares in master cartons" /></Field>
          </>
        )}
        {!vendor && <div className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-xl p-6 text-center">Select a vendor to add products. Only products mapped to that vendor are listed.</div>}
      </div>
    </Modal>
  )
}

// ====================================================================== DETAIL
function OrderDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const s = useStore()
  const po = s.purchaseOrders.find((p) => p.id === id)
  const { canEdit, isAdmin, user } = useCanEdit()
  const [tab, setTab] = useState('overview')
  if (!po) return <EmptyState title="Purchase order not found" action={<Button variant="secondary" icon={ArrowLeft} onClick={() => nav('..')}>Back to list</Button>} />
  const vendor = s.vendors.find((v) => v.id === po.vendorId)
  const shipment = s.shipments.find((x) => x.id === po.shipmentId)
  const flow = po.type === 'DOMESTIC' ? DOMESTIC_FLOW : PO_FLOW
  const stepKey = flow.some((f) => f.key === po.status) ? po.status : po.status === 'QC_PENDING' ? 'IN_PRODUCTION' : 'DRAFT'

  const approve = async (ok) => {
    const remark = ok ? await prompt({ title: `Approve ${po.number}`, label: 'Approval remark (optional)', confirmText: 'Approve & send to vendor' }) : await prompt({ title: `Reject ${po.number}`, label: 'Reason for rejection', required: true, tone: 'danger', confirmText: 'Reject PO' })
    if (remark === null) return
    s.approvePO(po.id, ok, remark)
    ok ? toast.success('PO approved', `Emailed to ${vendor.name} and published on Vendor Portal`) : toast.warn('PO rejected', 'Purchase team notified')
  }
  const cancel = async () => {
    const r = await prompt({ title: `Cancel ${po.number}`, label: 'Reason', required: true, tone: 'danger', confirmText: 'Cancel PO' })
    if (r === null) return
    s.cancelPO(po.id, r)
    toast.warn('PO cancelled')
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    po.type !== 'DOMESTIC' && { key: 'pi', label: 'Proforma Invoice' },
    po.type !== 'DOMESTIC' && { key: 'branding', label: 'MRP · Labels · Barcodes' },
    po.type !== 'DOMESTIC' && { key: 'qc', label: 'QC & Packing' },
    { key: 'payments', label: 'Payments' },
    { key: 'docs', label: 'Documents', count: (po.docs || []).length },
    { key: 'timeline', label: 'Timeline' },
    { key: 'print', label: 'Print PO' },
  ].filter(Boolean)

  return (
    <div>
      <PageHeader
        breadcrumb={<Link to="/erp/purchase/orders" className="hover:underline">Purchase Orders</Link>}
        title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{po.number}</span><StatusBadge status={po.status} /><Badge tone={po.type === 'IMPORT' ? 'blue' : po.type === 'DOMESTIC' ? 'teal' : 'violet'}>{po.type}</Badge></span>}
        subtitle={`${vendor?.name} · ${fmtDate(po.date)} · ${fmtMoney(poValue(po), po.currency)}${po.currency !== 'INR' ? ` (${fmtINR(poValueINR(po, s.settings.fx))})` : ''}`}
        actions={<>
          {po.status === 'DRAFT' && canEdit && <Button icon={Send} onClick={() => { s.submitPOForApproval(po.id); toast.success('Sent for Director approval') }}>Submit for approval</Button>}
          {po.status === 'PENDING_APPROVAL' && isAdmin && <><Button variant="danger" icon={XCircle} onClick={() => approve(false)}>Reject</Button><Button variant="success" icon={CheckCircle2} onClick={() => approve(true)}>Approve</Button></>}
          {po.status === 'PENDING_APPROVAL' && !isAdmin && <Badge tone="amber" className="self-center">Awaiting Director approval</Badge>}
          {['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(po.status) && canEdit && <Button variant="secondary" icon={Ban} onClick={cancel}>Cancel PO</Button>}
          <Button variant="secondary" icon={Printer} onClick={() => setTab('print')}>Print</Button>
        </>}
      />
      {!['REJECTED', 'CANCELLED'].includes(po.status) ? <Card className="mb-4" bodyClass="py-3"><Stepper steps={flow} current={stepKey} /></Card>
        : <Alert tone="error" className="mb-4" title={`PO ${po.status.toLowerCase()}`}>{po.timeline[po.timeline.length - 1]?.text}</Alert>}
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' && <Overview po={po} vendor={vendor} shipment={shipment} canEdit={canEdit} isAdmin={isAdmin} goTab={setTab} />}
      {tab === 'pi' && <PIPanel po={po} vendor={vendor} canEdit={canEdit} isAdmin={isAdmin} user={user} />}
      {tab === 'branding' && <BrandingPanel po={po} />}
      {tab === 'qc' && <QCPanel po={po} canEdit={canEdit} />}
      {tab === 'payments' && <PaymentsPanel po={po} shipment={shipment} canEdit={canEdit} />}
      {tab === 'docs' && <DocsPanel po={po} canEdit={canEdit} />}
      {tab === 'timeline' && <Card title="Activity timeline"><Timeline items={[...(po.timeline || [])].reverse()} /></Card>}
      {tab === 'print' && <PrintPO po={po} vendor={vendor} />}
    </div>
  )
}

function LinesTable({ po }) {
  const fx = useStore((s) => s.settings.fx)
  const products = useStore((s) => s.products)
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Rate</th><th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">MRP</th><th className="text-right px-3 py-2">CBM</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {po.lines.map((l) => {
              const p = products.find((x) => x.id === l.productId)
              return (
                <tr key={l.productId}>
                  <td className="px-3 py-2"><ProductCell id={l.productId} sub={l.qty < p?.moq ? `below MOQ ${p.moq}` : undefined} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.rate, po.currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(l.qty * l.rate, po.currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{l.mrp ? fmtINR(l.mrp) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtNum(round2(l.qty * (p?.cbm || 0)))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm flex flex-wrap justify-end gap-x-6 gap-y-1">
        <span className="text-slate-500">{fmtNum(sum(po.lines, (l) => l.qty))} units · {fmtNum(round2(sum(po.lines, (l) => l.qty * (products.find((p) => p.id === l.productId)?.cbm || 0))))} cbm</span>
        <span className="font-bold">{fmtMoney(poValue(po), po.currency)}{po.currency !== 'INR' && <span className="font-normal text-slate-500"> ≈ {fmtINR(poValueINR(po, fx))}</span>}</span>
      </div>
    </div>
  )
}

function Overview({ po, vendor, shipment, canEdit, isAdmin, goTab }) {
  const s = useStore()
  const so = s.salesOrders.find((x) => x.id === po.linkedSoId)
  const partner = so && s.partners.find((p) => p.id === so.partnerId)
  const [slot, setSlot] = useState(null)
  const [dispatch, setDispatch] = useState(null)
  const t = po.paymentTerms || vendor.paymentTerms
  const qcPending = (po.qc || []).filter((q) => q.status === 'PENDING').length

  const receive = async () => {
    if (!(await confirm({ title: 'Receive goods at Btali?', message: `Stock for ${po.lines.length} item(s) will be added to Btali – Bhiwandi and a GRN generated.`, confirmText: 'Receive & add stock' }))) return
    const grn = s.receiveDomesticPO(po.id)
    toast.success('Goods received', `${grn} · stock updated`)
  }
  const recordPayment = async () => {
    const bal = round2(so.total - (so.paidAmount || 0))
    if (!(await confirm({ title: 'Record customer payment', message: `Record ${fmtINR(bal)} received from ${partner?.name} against ${so.number}? This unlocks vendor dispatch.`, confirmText: 'Record receipt' }))) return
    s.recordReceipt({ soId: so.id, amount: bal, mode: 'NEFT', ref: `UTR${Date.now().toString().slice(-10)}` })
    toast.success('Customer payment recorded', 'Vendor dispatch unlocked')
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 space-y-4">
        {po.type === 'DOMESTIC' && (
          <Card title="Vendor dispatch & receipt" subtitle={po.requiresCustomerPayment ? 'Back-to-back order – customer must pay in full before the vendor ships' : 'Domestic vendor delivers directly to Btali'}>
            {po.requiresCustomerPayment && (
              <div className={`rounded-xl border p-3 mb-3 flex flex-wrap items-center gap-3 ${po.customerPaid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                {po.customerPaid ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Lock className="w-5 h-5 text-amber-600" />}
                <div className="flex-1 min-w-[200px] text-sm">
                  <div className="font-semibold">{po.customerPaid ? 'Customer payment received – dispatch unlocked' : 'Locked: waiting for customer payment'}</div>
                  {so && <div className="text-slate-600 text-xs mt-0.5">{so.number} · {partner?.name} · {fmtINR(so.total)} · paid {fmtINR(so.paidAmount || 0)} <StatusBadge status={so.paymentStatus} /></div>}
                </div>
                {!po.customerPaid && canEdit && <Button size="sm" variant="secondary" icon={Mail} onClick={() => { s.requestCustomerPayment(po.id); toast.success('Accounts & Sales reminded') }}>Remind Accounts</Button>}
                {!po.customerPaid && isAdmin && so && <Button size="sm" variant="soft" icon={Wallet} onClick={recordPayment}>Record receipt</Button>}
              </div>
            )}
            {po.vendorDispatch ? (
              <DescriptionList cols={4} items={[['LR / Docket', po.vendorDispatch.lrNo], ['Dispatch date', fmtDate(po.vendorDispatch.date)], ['Vehicle', po.vendorDispatch.vehicleNo || '—'], ['GRN', po.grnNo || (po.status === 'RECEIVED' ? 'Received' : 'Pending')]]} />
            ) : <div className="text-sm text-slate-500">Vendor has not dispatched yet.</div>}
            <div className="flex flex-wrap gap-2 mt-3">
              {['APPROVED'].includes(po.status) && canEdit && (
                <Button icon={Truck} disabled={po.requiresCustomerPayment && !po.customerPaid} title={po.requiresCustomerPayment && !po.customerPaid ? 'Customer payment pending' : ''} onClick={() => setDispatch({ lrNo: '', date: today(), vehicleNo: '' })}>Confirm vendor dispatch</Button>
              )}
              {po.status === 'SHIPPED' && canEdit && <Button variant="success" icon={PackageCheck} onClick={receive}>Receive goods</Button>}
              {po.status === 'RECEIVED' && <Badge tone="green">Received {fmtDate(po.receivedAt)} – stock added</Badge>}
            </div>
          </Card>
        )}
        <Card title="Order lines"><LinesTable po={po} /></Card>
        <Card title="Delivery schedule" subtitle="Declared by vendor on the portal or agreed by Purchase" actions={canEdit && !['RECEIVED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(po.status) && <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setSlot({ date: addDays(today(), 30), qty: sum(po.lines, (l) => l.qty), note: '' })}>Add slot</Button>}>
          {(po.deliverySchedule || []).length === 0 ? <div className="text-sm text-slate-400">No delivery dates declared yet.</div> : (
            <ul className="divide-y divide-slate-100">
              {po.deliverySchedule.map((d) => {
                const late = d.date < today() && !['SHIPPED', 'RECEIVED', 'CLOSED', 'READY_TO_SHIP'].includes(po.status)
                return <li key={d.id} className="py-2 flex items-center gap-3 text-sm"><span className={`font-medium w-28 ${late ? 'text-red-600' : ''}`}>{fmtDate(d.date)}</span><span className="tabular-nums w-24">{fmtNum(d.qty)} units</span><span className="text-slate-500 flex-1">{d.note}</span>{late && <Badge tone="red">Late</Badge>}<Badge tone="gray">{d.by === 'BTALI' ? 'Btali' : 'Vendor'}</Badge></li>
              })}
            </ul>
          )}
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Order details">
          <DescriptionList cols={1} items={[
            ['Vendor', <span key="v">{vendor.name}<div className="text-xs text-slate-500">{vendor.contact} · {vendor.email}</div></span>],
            ['Payment terms', `${t.advancePct}% advance · ${t.balancePct}% balance${t.creditDays ? ` · ${t.creditDays} days credit` : ''}`],
            ['Created', <span key="c">{fmtDate(po.date)} by <UserName id={po.createdBy} /></span>],
            ['Approval', po.approvedBy ? <span key="a"><UserName id={po.approvedBy} />{po.approvedAt ? ` · ${fmtDateTime(po.approvedAt)}` : ''}</span> : po.status === 'PENDING_APPROVAL' ? 'Pending with Director' : '—'],
            ['Source', (po.source || 'MANUAL').replace(/_/g, ' ').toLowerCase()],
            po.note && ['Note', po.note],
            so && ['Linked sales order', `${so.number} · ${partner?.name}`],
            shipment && ['Shipment', <Link key="s" to={`/erp/purchase/shipments?id=${shipment.id}`} className="text-brand-600 hover:underline">{shipment.number} · {shipment.containerNo} · ETA {fmtDate(shipment.eta)}</Link>],
          ]} />
        </Card>
        {po.type !== 'DOMESTIC' && (
          <Card title="Readiness checklist">
            {[
              ['Proforma invoice approved', po.pi?.status === 'APPROVED', () => goTab('pi'), po.pi?.status === 'PENDING' ? 'Awaiting approval' : null],
              ['MRP confirmed', po.mrpConfirmed, () => goTab('branding')],
              ['Labels sent to vendor', po.labelsSent, () => goTab('branding')],
              ['Barcodes generated', po.barcodesGenerated, () => goTab('branding')],
              ['Stickers applied (vendor)', po.stickerConfirmed, () => goTab('branding')],
              ['QC approved', !!po.qcApprovedAt, () => goTab('qc'), qcPending ? `${qcPending} file(s) to review` : null],
              ['Shipped', !!po.shipmentId, null],
            ].map(([l, ok, fn, hint]) => (
              <button key={l} type="button" onClick={fn || undefined} className="w-full flex items-center gap-2 py-1.5 text-sm text-left hover:bg-slate-50 rounded px-1">
                {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <span className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                <span className={ok ? 'text-slate-800' : 'text-slate-500'}>{l}</span>
                {hint && <Badge tone="amber" className="ml-auto">{hint}</Badge>}
              </button>
            ))}
          </Card>
        )}
      </div>

      <Modal open={!!slot} onClose={() => setSlot(null)} title="Add delivery slot" size="sm"
        footer={<><Button variant="secondary" onClick={() => setSlot(null)}>Cancel</Button><Button onClick={() => { s.addDeliverySchedule(po.id, slot); setSlot(null); toast.success('Delivery slot added') }}>Add</Button></>}>
        {slot && <div className="space-y-3">
          <Field label="Date"><Input type="date" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} /></Field>
          <Field label="Quantity"><NumberInput value={slot.qty} onChange={(v) => setSlot({ ...slot, qty: v })} /></Field>
          <Field label="Note"><Input value={slot.note} onChange={(e) => setSlot({ ...slot, note: e.target.value })} placeholder="e.g. Part shipment – pumps only" /></Field>
        </div>}
      </Modal>
      <Modal open={!!dispatch} onClose={() => setDispatch(null)} title="Confirm vendor dispatch" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDispatch(null)}>Cancel</Button><Button disabled={!dispatch?.lrNo} onClick={() => { const r = s.confirmVendorDispatch(po.id, dispatch); if (!r.ok) return toast.error(r.error); setDispatch(null); toast.success('Vendor dispatch confirmed', 'Btali & Sales notified') }}>Confirm dispatch</Button></>}>
        {dispatch && <div className="space-y-3">
          <Field label="LR / Docket no." required><Input value={dispatch.lrNo} onChange={(e) => setDispatch({ ...dispatch, lrNo: e.target.value })} placeholder="e.g. RPP/LR/2210" /></Field>
          <Field label="Dispatch date"><Input type="date" value={dispatch.date} onChange={(e) => setDispatch({ ...dispatch, date: e.target.value })} /></Field>
          <Field label="Vehicle no."><Input value={dispatch.vehicleNo} onChange={(e) => setDispatch({ ...dispatch, vehicleNo: e.target.value })} placeholder="GJ03 AB 1234" /></Field>
        </div>}
      </Modal>
    </div>
  )
}

function StampedCopy({ po }) {
  const { user } = useLookup()
  return (
    <div className="relative border border-slate-200 rounded-xl p-5 bg-white overflow-hidden">
      <div className="text-xs text-slate-400 uppercase tracking-wide">Proforma Invoice</div>
      <div className="font-mono text-lg font-semibold">{po.pi.number}</div>
      <div className="text-sm text-slate-600 mt-1">{fmtMoney(po.pi.amount || poValue(po), po.currency)} · against {po.number}</div>
      <div className="absolute right-4 top-4 rotate-[-10deg] border-[3px] border-emerald-600 text-emerald-700 rounded-lg px-3 py-1.5 text-center bg-white/80">
        <div className="text-[10px] font-bold tracking-widest">BTALI INTERNATIONAL</div>
        <div className="text-base font-black tracking-wider">APPROVED</div>
        <div className="text-[10px]">{fmtDate(po.pi.approvedAt || po.date)} · {user(po.pi.approvedBy)?.name || 'Director'}</div>
      </div>
    </div>
  )
}

function PIPanel({ po, vendor, canEdit, isAdmin }) {
  const s = useStore()
  const [up, setUp] = useState(null)
  const pi = po.pi
  const decide = async (ok) => {
    if (ok) {
      if (!(await confirm({ title: 'Approve PI with digital stamp?', message: `A stamped copy of ${pi.number} will be shared with ${vendor.name} on the Vendor Portal and production will start.`, confirmText: 'Approve & stamp' }))) return
      s.approvePI(po.id, true, '')
      toast.success('PI approved', 'Stamped copy shared with vendor')
    } else {
      const r = await prompt({ title: 'Reject PI', label: 'What should the vendor correct?', required: true, tone: 'danger', confirmText: 'Reject PI' })
      if (r === null) return
      s.approvePI(po.id, false, r)
      toast.warn('PI rejected', 'Vendor asked to re-upload')
    }
  }
  if (['DRAFT', 'PENDING_APPROVAL'].includes(po.status)) return <Card><EmptyState icon={FileText} title="PI not requested yet" message="The PO is shared with the vendor once the Director approves it. The vendor then uploads the Proforma Invoice on the portal." /></Card>
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Vendor proforma invoice" actions={pi && <StatusBadge status={pi.status} />}>
        {!pi || pi.status === 'REJECTED' ? (
          <div className="space-y-3">
            {pi?.status === 'REJECTED' && <Alert tone="error" title="Previous PI rejected">{pi.remark}</Alert>}
            <Alert tone="info">Awaiting PI upload from {vendor.name} on the Vendor Portal. If the vendor emailed it, upload it here.</Alert>
            {canEdit && !up && <Button variant="secondary" icon={FileText} onClick={() => setUp({ number: '', amount: round2(poValue(po)), file: null })}>Upload PI received by email</Button>}
            {up && (
              <div className="space-y-3 border border-slate-200 rounded-xl p-3">
                <FormGrid>
                  <Field label="PI number" required><Input value={up.number} onChange={(e) => setUp({ ...up, number: e.target.value })} placeholder={`${vendor.code}-PI-…`} /></Field>
                  <Field label={`Amount (${po.currency})`}><NumberInput value={up.amount} onChange={(v) => setUp({ ...up, amount: v })} /></Field>
                </FormGrid>
                {up.file ? <AttachmentList items={[up.file]} onRemove={() => setUp({ ...up, file: null })} /> : <FileUpload compact multiple={false} onFiles={([f]) => setUp({ ...up, file: f })} label="Attach PI (PDF / image)" />}
                <div className="flex gap-2 justify-end"><Button variant="secondary" onClick={() => setUp(null)}>Cancel</Button>
                  <Button disabled={!up.number || !up.file} onClick={() => { s.uploadPI(po.id, up); setUp(null); toast.success('PI uploaded', 'Sent for approval') }}>Save PI</Button></div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <DescriptionList items={[['PI number', pi.number], ['Amount', fmtMoney(pi.amount || poValue(po), po.currency)], ['Uploaded', pi.uploadedAt ? fmtDateTime(pi.uploadedAt) : '—'], ['PO value', fmtMoney(poValue(po), po.currency)]]} />
            {pi.amount > 0 && Math.abs(pi.amount - poValue(po)) > 1 && <Alert tone="warn" title="PI amount differs from PO">Difference {fmtMoney(pi.amount - poValue(po), po.currency)} – check rates before approving.</Alert>}
            <AttachmentList items={[pi.file].filter(Boolean)} />
            {pi.status === 'PENDING' && (canEdit || isAdmin) && (
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="danger" icon={XCircle} onClick={() => decide(false)}>Reject</Button>
                <Button variant="success" icon={Stamp} onClick={() => decide(true)}>Approve with digital stamp</Button>
              </div>
            )}
          </div>
        )}
      </Card>
      <Card title="Stamped copy" subtitle="Shared with vendor automatically on approval">
        {pi?.status === 'APPROVED' ? (
          <div className="space-y-3">
            <StampedCopy po={po} />
            <AttachmentList items={[pi.stampedFile].filter(Boolean)} />
          </div>
        ) : <div className="text-sm text-slate-400">Available after the PI is approved.</div>}
      </Card>
    </div>
  )
}

function BrandingPanel({ po }) {
  const units = useStore((s) => s.units)
  const n = units.filter((u) => u.poId === po.id)
  const rows = [
    { icon: Tag, label: 'MRP confirmed', ok: po.mrpConfirmed, sub: po.mrpConfirmedAt ? fmtDateTime(po.mrpConfirmedAt) : 'Vendor rate × FX × multiplier', link: `/erp/purchase/mrp-labels?po=${po.id}`, cta: 'Open MRP & labels' },
    { icon: Send, label: 'Label artwork sent to vendor', ok: po.labelsSent, sub: po.labelsSentAt ? fmtDateTime(po.labelsSentAt) : 'Published to Vendor Portal', link: `/erp/purchase/mrp-labels?po=${po.id}`, cta: 'Send labels' },
    { icon: BarcodeIcon, label: 'Barcodes generated', ok: po.barcodesGenerated, sub: n.length ? `${fmtNum(n.length)} codes · ${n[0].code} …` : 'One per unit, one per carton for spares', link: `/erp/purchase/barcodes?po=${po.id}`, cta: 'Barcodes & stickers' },
    { icon: Send, label: 'Barcode stickers uploaded to vendor', ok: po.barcodesSent || po.stickerConfirmed, sub: po.barcodesSentAt ? fmtDateTime(po.barcodesSentAt) : '—', link: `/erp/purchase/barcodes?po=${po.id}`, cta: 'Upload' },
    { icon: CheckCircle2, label: 'Vendor confirmed printing & application', ok: po.stickerConfirmed, sub: po.stickerConfirmed ? 'Confirmed on Vendor Portal' : 'Pending vendor confirmation', link: null },
  ]
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.label} className="py-3 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${r.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><r.icon className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0"><div className="text-sm font-medium text-slate-800">{r.label}</div><div className="text-xs text-slate-500 truncate">{r.sub}</div></div>
            {r.ok ? <Badge tone="green">Done</Badge> : <Badge tone="amber">Pending</Badge>}
            {r.link && <Link to={r.link} className="text-xs text-brand-600 hover:underline whitespace-nowrap hidden sm:inline">{r.cta} →</Link>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

const packingLines = (po, products) => (po.packingList?.lines?.length ? po.packingList.lines : po.lines.map((l) => {
  const p = products.find((x) => x.id === l.productId)
  return { productId: l.productId, qty: l.qty, cartons: Math.ceil(l.qty / (p.cartonQty || 1)), cbm: round2(l.qty * p.cbm), weight: round2(l.qty * p.weightKg) }
}))

function QCPanel({ po, canEdit }) {
  const s = useStore()
  const plines = packingLines(po, s.products)
  const units = s.units.filter((u) => u.poId === po.id)
  const scanned = units.filter((u) => u.status !== 'GENERATED').length
  const qc = po.qc || []
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card title="QC summary" actions={<Link to={`/erp/purchase/qc?po=${po.id}`} className="text-xs text-brand-600 hover:underline">Open QC review →</Link>}>
        <Grid cols={2}>
          <KV label="Files uploaded" value={qc.length} /><KV label="Pending" value={qc.filter((q) => q.status === 'PENDING').length} />
          <KV label="Approved" value={qc.filter((q) => q.status === 'APPROVED').length} /><KV label="Rejected" value={qc.filter((q) => q.status === 'REJECTED').length} />
        </Grid>
        <div className="mt-2 text-sm">{po.qcApprovedAt ? <Badge tone="green">QC released {fmtDate(po.qcApprovedAt)}</Badge> : <Badge tone="amber">Not released</Badge>}{po.qcRejectedOnce && <Badge tone="red" className="ml-1">Re-work needed once</Badge>}</div>
        {(po.improvements || []).length > 0 && <>
          <SectionTitle className="mt-4">Vendor-declared improvements</SectionTitle>
          <ul className="space-y-1.5">{po.improvements.map((i) => <li key={i.id} className="text-sm flex gap-2"><span className="flex-1">{i.text}</span>{i.ack ? <Badge tone="green">Ack</Badge> : <Badge tone="amber">New</Badge>}</li>)}</ul>
        </>}
      </Card>
      <Card className="xl:col-span-2" title="Packing list" subtitle={po.packingList?.source === 'BARCODE_SCAN' ? `Generated from barcode scans at loading · ${fmtNum(scanned)} of ${fmtNum(units.length)} units scanned` : 'Computed from PO lines and product master (cartons, CBM, weight)'}
        actions={<>
          <Button size="sm" variant="secondary" icon={Download} onClick={() => exportCSV(`packing-list-${po.number.replace(/\//g, '-')}.csv`, plines, [{ header: 'SKU', value: (l) => s.products.find((p) => p.id === l.productId)?.sku }, { header: 'Product', value: (l) => s.products.find((p) => p.id === l.productId)?.name }, { header: 'Qty', value: (l) => l.qty }, { header: 'Cartons', value: (l) => l.cartons }, { header: 'CBM', value: (l) => l.cbm }, { header: 'Weight kg', value: (l) => l.weight }])}>CSV</Button>
          {canEdit && <Button size="sm" icon={Send} onClick={() => { s.sendPackingListToBtali(po.id, plines); toast.success('Packing list sent to Btali') }}>{po.packingList?.sentToBtaliAt ? 'Re-send to Btali' : 'Send to Btali'}</Button>}
        </>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Cartons</th><th className="text-right px-3 py-2">CBM</th><th className="text-right px-3 py-2">Weight (kg)</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{plines.map((l) => <tr key={l.productId}><td className="px-3 py-2"><ProductCell id={l.productId} /></td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.cartons)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.cbm)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.weight)}</td></tr>)}</tbody>
            <tfoot className="bg-slate-50 font-semibold"><tr><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right">{fmtNum(sum(plines, (l) => l.qty))}</td><td className="px-3 py-2 text-right">{fmtNum(sum(plines, (l) => l.cartons))}</td><td className="px-3 py-2 text-right">{fmtNum(round2(sum(plines, (l) => l.cbm)))}</td><td className="px-3 py-2 text-right">{fmtNum(round2(sum(plines, (l) => l.weight)))}</td></tr></tfoot>
          </table>
        </div>
        {po.packingList?.sentToBtaliAt && <div className="text-xs text-emerald-700 mt-2">Shared with Btali {fmtDateTime(po.packingList.sentToBtaliAt)}</div>}
      </Card>
    </div>
  )
}

function PaymentsPanel({ po, shipment, canEdit }) {
  const s = useStore()
  const rows = paymentSchedule(po, shipment, s.settings.fx)
  const bills = (s.vendorBills || []).filter((b) => b.poId === po.id)
  return (
    <div className="space-y-4">
      <Card title="Payment schedule" subtitle="Derived from vendor payment terms" actions={canEdit && <Button size="sm" variant="secondary" icon={Mail} onClick={() => { s.sendPIToAccounts(po.id); toast.success('Shared with Accounts', 'Email + notification sent') }}>{po.sentToAccountsAt ? 'Re-share with Accounts' : 'Share with Accounts'}</Button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr><th className="text-left px-3 py-2">Instalment</th><th className="text-left px-3 py-2">Basis</th><th className="text-left px-3 py-2">Due date</th><th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">INR</th><th className="text-left px-3 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const bill = bills.find((b) => (r.key === 'ADV' ? /adv/i.test(b.vendorRef || b.number) : true) && b.status === 'PAID')
                const d = daysBetween(today(), r.due)
                const st = bill ? 'PAID' : ['RECEIVED', 'CLOSED'].includes(po.status) && r.key === 'ADV' ? 'PAID' : d < 0 ? 'OVERDUE' : d <= 7 ? 'DUE' : 'SCHEDULED'
                return <tr key={r.key}><td className="px-3 py-2 font-medium">{r.label}</td><td className="px-3 py-2 text-slate-500">{r.basis}</td><td className="px-3 py-2">{fmtDate(r.due)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.amount, po.currency)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(r.amountINR)}</td><td className="px-3 py-2"><StatusBadge status={st} label={st === 'DUE' ? `Due in ${d}d` : undefined} /></td></tr>
              })}
            </tbody>
          </table>
        </div>
        {po.sentToAccountsAt && <div className="text-xs text-slate-500 mt-2">Shared with Accounts on {fmtDateTime(po.sentToAccountsAt)}</div>}
      </Card>
      <Card title="Vendor bills & SWIFT copies">
        {bills.length ? <ul className="divide-y divide-slate-100">{bills.map((b) => <li key={b.id} className="py-2 flex justify-between text-sm"><span className="font-mono">{b.number}</span><span>{fmtMoney(b.amount, b.currency)}</span><StatusBadge status={b.status} /></li>)}</ul>
          : <AttachmentList items={(po.docs || []).filter((d) => /SWIFT/i.test(d.name) || d.docType === 'SWIFT')} empty="No payments recorded yet – Accounts attaches SWIFT copies when paying." />}
      </Card>
    </div>
  )
}

const DOC_TYPES = ['PI', 'PI_STAMPED', 'CI', 'PL', 'BL', 'BOE', 'IGM', 'CAN', 'INSURANCE', 'COO', 'SWIFT', 'TELEX', 'MRP_LABEL', 'BARCODE', 'QC', 'OTHER']
function DocsPanel({ po, canEdit }) {
  const s = useStore()
  const [type, setType] = useState('CI')
  const [busy, setBusy] = useState(false)
  const zip = async () => {
    setBusy(true)
    const z = new JSZip()
    for (const d of po.docs || []) {
      const folder = z.folder(d.docType || 'OTHER')
      if (d.url && d.url.startsWith('data:')) folder.file(d.name, d.url.split(',')[1], { base64: true })
      else folder.file(d.name.replace(/\.(pdf|xlsx|jpg|png|mp4)$/i, '') + '.txt', `Btali International – ${po.number}\nDocument: ${d.name}\nType: ${d.docType || 'OTHER'}\nUploaded: ${d.uploadedAt || ''}`)
    }
    const blob = await z.generateAsync({ type: 'blob' })
    downloadBlob(`${po.number.replace(/\//g, '-')}-documents.zip`, blob)
    setBusy(false)
    toast.success('Document locker downloaded')
  }
  return (
    <Card title="Document locker" subtitle="Every document for this order in one place" actions={<Button size="sm" variant="secondary" icon={Download} loading={busy} disabled={!(po.docs || []).length} onClick={zip}>Download ZIP</Button>}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><AttachmentList items={po.docs || []} empty="No documents yet." /></div>
        {canEdit && (
          <div className="space-y-2">
            <Field label="Document type"><Select value={type} onChange={(e) => setType(e.target.value)} options={DOC_TYPES.map((d) => ({ value: d, label: d.replace(/_/g, ' ') }))} /></Field>
            <FileUpload onFiles={(atts) => { s.addPODocs(po.id, atts, type); toast.success(`${atts.length} document(s) added`) }} label="Upload documents" hint="PDF, images, spreadsheets" />
          </div>
        )}
      </div>
    </Card>
  )
}

function PrintPO({ po, vendor }) {
  const products = useStore((s) => s.products)
  const t = po.paymentTerms || vendor.paymentTerms
  return (
    <PrintArea title={po.number}>
      <DocHeader title="Purchase Order" number={po.number} date={po.date} right={<div className="text-xs text-slate-500 mt-1">{po.type} · {po.currency}</div>} />
      <div className="grid grid-cols-2 gap-6 text-sm mb-4">
        <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Supplier</div><div className="font-semibold">{vendor.name}</div><div className="text-slate-600">{vendor.city}, {vendor.country}<br />{vendor.contact} · {vendor.email}{vendor.gst ? <><br />GSTIN {vendor.gst}</> : null}</div></div>
        <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Deliver to</div><div className="font-semibold">Btali 3PL – Bhiwandi</div><div className="text-slate-600">Gala 14-18, Btali Logistics Park, Vadape, Bhiwandi 421302{po.type === 'IMPORT' ? <><br />Port of discharge: Nhava Sheva (INNSA)</> : null}</div></div>
      </div>
      <table className="w-full text-sm border border-slate-300">
        <thead className="bg-slate-100"><tr><th className="text-left p-2 border-b border-slate-300">#</th><th className="text-left p-2 border-b border-slate-300">Item</th><th className="text-left p-2 border-b border-slate-300">HSN</th><th className="text-right p-2 border-b border-slate-300">Qty</th><th className="text-right p-2 border-b border-slate-300">Rate</th><th className="text-right p-2 border-b border-slate-300">Amount</th></tr></thead>
        <tbody>{po.lines.map((l, i) => { const p = products.find((x) => x.id === l.productId); return <tr key={i} className="border-b border-slate-200"><td className="p-2">{i + 1}</td><td className="p-2">{p.sku} – {p.name}</td><td className="p-2">{p.hsn}</td><td className="p-2 text-right">{fmtNum(l.qty)}</td><td className="p-2 text-right">{fmtMoney(l.rate, po.currency)}</td><td className="p-2 text-right">{fmtMoney(l.qty * l.rate, po.currency)}</td></tr> })}</tbody>
        <tfoot><tr><td colSpan={5} className="p-2 text-right font-semibold">Total ({po.currency})</td><td className="p-2 text-right font-bold">{fmtMoney(poValue(po), po.currency)}</td></tr></tfoot>
      </table>
      <div className="grid grid-cols-2 gap-6 text-xs text-slate-600 mt-4">
        <div><div className="font-semibold text-slate-800 mb-1">Terms</div>Payment: {t.advancePct}% advance, {t.balancePct}% balance{t.creditDays ? ` within ${t.creditDays} days of BL` : ''}.<br />Every unit to carry Btali MRP label and barcode sticker as issued on the Vendor Portal.<br />QC photos/videos to be uploaded before shipment; goods ship only after Btali QC release.<br />{po.deliverySchedule?.[0] ? `Required delivery: ${fmtDate(po.deliverySchedule[0].date)}.` : ''}</div>
        <div className="text-right"><div className="h-12" />{po.approvedBy ? <div className="inline-block border-2 border-emerald-600 text-emerald-700 rounded px-2 py-1 font-bold text-[11px] rotate-[-4deg]">APPROVED · DIRECTOR</div> : null}<div className="mt-2 font-semibold text-slate-800">For Btali International Pvt. Ltd.</div><div>Authorised signatory</div></div>
      </div>
    </PrintArea>
  )
}
