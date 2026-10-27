import React, { useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Upload, FileCheck2, Printer, CheckCircle2, CalendarPlus, Trash2, Camera, Lightbulb, Banknote, Ship, ScanLine, Download, Tag, Send, Truck, AlertTriangle,
} from 'lucide-react'
import { useStore } from '../../store'
import {
  PageHeader, Card, Badge, StatusBadge, Button, Tabs, Stepper, Field, FormGrid, Input, NumberInput, Textarea, Select, FileUpload, AttachmentList, MediaGrid,
  Alert, EmptyState, DescriptionList, Barcode, Timeline, Segmented, toast, confirm, openAttachment, cx, ProductImage, IconButton,
} from '../../components/ui'
import DataTable from '../../components/DataTable'
import { ProductCell, PrintArea, DocHeader } from '../../components/business'
import { fmtDate, fmtNum, today, exportCSV } from '../../lib/format'
import { packingSummary } from '../../store/slices/vendor'
import { useVendorScope, poActions, poTotal, fmtUSD, PO_STEPS, forwarderFor } from './_parts'

export default function Orders() {
  return (
    <Routes>
      <Route index element={<OrderList />} />
      <Route path=":id" element={<Workspace />} />
    </Routes>
  )
}

function OrderList() {
  const { pos } = useVendorScope()
  const units = useStore((s) => s.units)
  const shipments = useStore((s) => s.shipments)
  const vendorDocs = useStore((s) => s.vendorDocs) || []
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const rows = pos.filter((p) => !status || p.status === status).map((p) => ({ ...p, actions: poActions(p, { units, shipments, vendorDocs }) }))
  const cols = [
    { key: 'number', header: 'PO number', render: (p) => <span className="font-mono text-xs font-semibold">{p.number}</span> },
    { key: 'date', header: 'Date', render: (p) => fmtDate(p.date) },
    { key: 'items', header: 'Items', value: (p) => p.lines.length, render: (p) => `${p.lines.length} items · ${fmtNum(p.lines.reduce((a, l) => a + l.qty, 0))} pcs` },
    { key: 'value', header: 'Value', align: 'right', value: (p) => poTotal(p), render: (p) => fmtUSD(poTotal(p), p.currency) },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    { key: 'next', header: 'Next action', value: (p) => p.actions[0]?.label || '', render: (p) => (p.actions.length ? <Badge tone="amber">{p.actions[0].label}{p.actions.length > 1 ? ` +${p.actions.length - 1}` : ''}</Badge> : <span className="text-xs text-slate-400">—</span>) },
  ]
  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle="Orders issued to you by Btali International" />
      <div className="mb-3 overflow-x-auto"><Segmented value={status} onChange={(v) => setParams(v ? { status: v } : {})} options={[{ key: '', label: 'All' }, ...PO_STEPS.map((s) => ({ key: s.key, label: s.label }))]} /></div>
      <DataTable columns={cols} rows={rows} onRowClick={(p) => nav(`/vendor/orders/${p.id}`)} exportName="btali-purchase-orders" searchPlaceholder="Search PO…" />
    </div>
  )
}

const TABS = [
  ['order', 'Order'], ['pi', 'Rates & PI'], ['labels', 'MRP Stickers & Barcodes'], ['schedule', 'Delivery Schedule'], ['qc', 'QC Uploads'],
  ['pl', 'Packing List & CI'], ['improvements', 'Product Improvements'], ['finance', 'Finance Docs'], ['forwarder', 'Forwarder'],
]

function Workspace() {
  const { id } = useParams()
  const { vendorId } = useVendorScope()
  const po = useStore((s) => s.purchaseOrders.find((p) => p.id === id))
  const units = useStore((s) => s.units)
  const shipments = useStore((s) => s.shipments)
  const vendorDocs = useStore((s) => s.vendorDocs) || []
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'order'
  if (!po || po.vendorId !== vendorId) return <Card><EmptyState title="Order not found" message="This purchase order is not available for your account." action={<Link to="/vendor/orders"><Button variant="secondary">Back to orders</Button></Link>} /></Card>
  const actions = poActions(po, { units, shipments, vendorDocs })
  const step = ['CLOSED'].includes(po.status) ? 'RECEIVED' : po.status
  return (
    <div>
      <PageHeader breadcrumb={<Link to="/vendor/orders" className="inline-flex items-center gap-1 hover:text-slate-800"><ArrowLeft className="w-3 h-3" />Purchase orders</Link>}
        title={po.number} subtitle={`Issued ${fmtDate(po.date)} · ${po.lines.length} items · ${fmtUSD(poTotal(po), po.currency)}`}
        actions={<StatusBadge status={po.status} className="text-xs" />} />
      <Card className="mb-4"><Stepper steps={PO_STEPS} current={step} /></Card>
      {actions.length > 0 && (
        <Alert tone="warn" className="mb-4" title="Action required">
          <div className="flex flex-wrap gap-2 mt-1">{actions.map((a) => <Button key={a.key} size="sm" variant="secondary" onClick={() => setParams({ tab: a.tab })}>{a.label}</Button>)}</div>
        </Alert>
      )}
      <Tabs className="mb-4" value={tab} onChange={(t) => setParams({ tab: t })} tabs={TABS.map(([key, label]) => ({ key, label }))} />
      {tab === 'order' && <OrderTab po={po} />}
      {tab === 'pi' && <PITab po={po} />}
      {tab === 'labels' && <LabelsTab po={po} />}
      {tab === 'schedule' && <ScheduleTab po={po} />}
      {tab === 'qc' && <QCTab po={po} />}
      {tab === 'pl' && <PLTab po={po} />}
      {tab === 'improvements' && <ImprovementsTab po={po} />}
      {tab === 'finance' && <FinanceTab po={po} />}
      {tab === 'forwarder' && <ForwarderTab po={po} />}
    </div>
  )
}

function OrderTab({ po }) {
  const products = useStore((s) => s.products)
  const vendor = useStore((s) => s.vendors.find((v) => v.id === po.vendorId))
  const pt = po.paymentTerms || vendor?.paymentTerms
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <PrintArea title={po.number}>
          <DocHeader title="Purchase Order" number={po.number} date={po.date} />
          <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
            <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Supplier</div><div className="font-semibold">{vendor?.name}</div><div className="text-xs text-slate-600">{vendor?.city}, {vendor?.country} · {vendor?.email}</div></div>
            <div className="sm:text-right"><div className="text-[11px] uppercase tracking-wide text-slate-400">Terms</div><div className="text-xs text-slate-600">{pt ? `${pt.advancePct}% advance, ${pt.balancePct}% balance${pt.creditDays ? ` · ${pt.creditDays} days credit` : ''}` : '—'}<br />FOB China port · Currency {po.currency}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">#</th><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Rate</th><th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">MRP (₹)</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {po.lines.map((l, i) => {
                  const p = products.find((x) => x.id === l.productId)
                  return <tr key={i}><td className="px-3 py-2">{i + 1}</td><td className="px-3 py-2"><div className="font-medium">{p?.name}</div><div className="text-[11px] text-slate-500">{p?.sku} · HSN {p?.hsn}</div></td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtUSD(l.rate, po.currency)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtUSD(l.qty * l.rate, po.currency)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.mrp || p?.mrp)}</td></tr>
                })}
              </tbody>
              <tfoot><tr className="bg-slate-50 font-bold"><td colSpan={4} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right tabular-nums">{fmtUSD(poTotal(po), po.currency)}</td><td /></tr></tfoot>
            </table>
          </div>
          <div className="text-[11px] text-slate-500 mt-4">Every unit must carry the Btali MRP sticker and the unique Btali barcode issued on the Vendor Portal. Final packing list must be generated by barcode scan.</div>
        </PrintArea>
      </div>
      <Card title="Order history"><Timeline items={[...(po.timeline || [])].reverse()} /></Card>
    </div>
  )
}

function PITab({ po }) {
  const uploadPI = useStore((s) => s.uploadPI)
  const [f, setF] = useState({ number: '', amount: poTotal(po) })
  const [file, setFile] = useState(null)
  const canUpload = po.status === 'APPROVED' || po.pi?.status === 'REJECTED'
  const submit = () => {
    if (!f.number.trim() || !file) return toast.error('PI number and PI file are required')
    uploadPI(po.id, { number: f.number.trim(), amount: Number(f.amount) || 0, file })
    toast.success('Proforma invoice submitted', 'Btali Purchase has been notified for approval.')
    setFile(null)
  }
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Confirmed rates" subtitle="Rates as per this PO">
        <div className="space-y-2">
          {po.lines.map((l) => <div key={l.productId} className="flex items-center justify-between gap-3"><ProductCell id={l.productId} sub={`${fmtNum(l.qty)} pcs`} /><span className="tabular-nums text-sm font-medium">{fmtUSD(l.rate, po.currency)}</span></div>)}
          <div className="flex justify-between border-t border-slate-100 pt-2 font-bold text-sm"><span>PO value</span><span>{fmtUSD(poTotal(po), po.currency)}</span></div>
        </div>
      </Card>
      <Card title="Proforma invoice">
        {po.pi && (
          <div className="mb-4 space-y-3">
            <DescriptionList items={[['PI number', po.pi.number], ['Amount', po.pi.amount ? fmtUSD(po.pi.amount, po.currency) : '—'], ['Submitted', fmtDate(po.pi.uploadedAt)], ['Status', <StatusBadge key="s" status={po.pi.status} label={po.pi.status === 'APPROVED' ? 'Approved by Btali' : undefined} />]]} />
            {po.pi.remark && po.pi.status === 'REJECTED' && <Alert tone="error" title="Returned by Btali">{po.pi.remark}</Alert>}
            <AttachmentList items={[po.pi.file && { ...po.pi.file, docType: 'Your PI' }, po.pi.stampedFile && { ...po.pi.stampedFile, docType: 'Btali stamped & approved PI' }].filter(Boolean)} />
          </div>
        )}
        {canUpload ? (
          <div className="space-y-3">
            <FormGrid cols={2}>
              <Field label="PI number" required><Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="e.g. NHP-PI-1026-01" /></Field>
              <Field label={`PI amount (${po.currency})`} required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
            </FormGrid>
            {file ? <AttachmentList items={[file]} onRemove={() => setFile(null)} /> : <FileUpload multiple={false} accept=".pdf,image/*" label="Upload signed PI (PDF)" onFiles={(a) => setFile(a[0])} />}
            {Number(f.amount) && Math.abs(Number(f.amount) - poTotal(po)) > 1 ? <Alert tone="warn">PI amount differs from PO value by {fmtUSD(Number(f.amount) - poTotal(po), po.currency)}.</Alert> : null}
            <Button icon={Upload} onClick={submit}>Submit PI to Btali</Button>
          </div>
        ) : !po.pi && <div className="text-sm text-slate-500">PI submission opens once the PO is released.</div>}
        {po.pi?.status === 'PENDING' && <Alert tone="info" className="mt-3">Awaiting Btali approval. You will be notified when the stamped PI is available.</Alert>}
      </Card>
    </div>
  )
}

function LabelsTab({ po }) {
  const units = useStore((s) => s.units)
  const products = useStore((s) => s.products)
  const confirmStickers = useStore((s) => s.vndConfirmStickers)
  const requestBarcodes = useStore((s) => s.vndRequestBarcodes)
  const mine = units.filter((u) => u.poId === po.id)
  const [photos, setPhotos] = useState([])
  const [view, setView] = useState('labels')
  return (
    <div className="space-y-4">
      <Card title="MRP sticker details" subtitle="Print exactly as shown – one sticker per unit (spares: per carton)">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {po.lines.map((l) => {
            const p = products.find((x) => x.id === l.productId)
            return (
              <div key={l.productId} className="border-2 border-dashed border-slate-300 rounded-xl p-3 text-xs">
                <div className="flex justify-between items-start"><span className="text-base font-black italic">B<span className="text-brand-500">TALI</span></span><Badge tone="ink">{p?.sku}</Badge></div>
                <div className="font-semibold text-sm mt-1">{p?.name}</div>
                <div className="mt-1 text-slate-600">{Object.entries(p?.specs || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
                <div className="mt-2 text-lg font-black">MRP ₹{fmtNum(l.mrp || p?.mrp)}<span className="text-[10px] font-normal text-slate-500"> (incl. of all taxes)</span></div>
                <div className="text-[10px] text-slate-500 mt-1">Net qty: {p?.type === 'SPARE' ? `${p.cartonQty} N per carton` : '1 N'} · Mfd. for Btali International Pvt. Ltd., Navi Mumbai 400705 · Customer care 1800 266 7700 · care@btali.in · Country of origin: China</div>
              </div>
            )
          })}
        </div>
      </Card>
      <Card title={`Btali barcodes (${mine.length})`} subtitle="Unique barcode per unit – stick on product body and carton"
        actions={mine.length > 0 && <Segmented size="sm" value={view} onChange={setView} options={[{ key: 'labels', label: 'Sticker sheet' }, { key: 'list', label: 'List' }]} />}>
        {mine.length === 0 ? (
          <EmptyState icon={Tag} title="Barcodes not issued yet" message={po.pi?.status === 'APPROVED' ? 'Btali issues barcodes after MRP confirmation.' : 'Barcodes are issued after the PI is approved.'}
            action={po.pi?.status === 'APPROVED' && <Button variant="secondary" icon={Send} disabled={!!po.barcodeRequestedAt} onClick={() => { requestBarcodes(po.id); toast.success('Request sent to Btali Purchase') }}>{po.barcodeRequestedAt ? 'Requested' : 'Request barcode sheet'}</Button>} />
        ) : view === 'labels' ? (
          <PrintArea title={`Barcodes ${po.number}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {mine.slice(0, 240).map((u) => {
                const p = products.find((x) => x.id === u.productId)
                return (
                  <div key={u.code} className="border border-slate-300 rounded p-1.5 text-center break-inside-avoid">
                    <div className="text-[9px] font-semibold truncate">BTALI · {p?.sku}</div>
                    <Barcode value={u.code} height={34} width={1.2} fontSize={11} className="mx-auto max-w-full" />
                  </div>
                )
              })}
            </div>
          </PrintArea>
        ) : (
          <div className="flex justify-end mb-2"><Button size="sm" variant="secondary" icon={Download} onClick={() => exportCSV(`barcodes-${po.number.replace(/\//g, '-')}.csv`, mine, [{ header: 'Barcode', value: (u) => u.code }, { header: 'SKU', value: (u) => products.find((p) => p.id === u.productId)?.sku }, { header: 'Pack qty', value: (u) => u.packQty || 1 }, { header: 'Status', value: (u) => u.status }])}>Download CSV</Button></div>
        )}
        {mine.length > 0 && view === 'list' && (
          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {mine.map((u) => <div key={u.code} className="px-3 py-1.5 flex items-center justify-between text-sm"><span className="font-mono">{u.code}</span><span className="text-xs text-slate-500">{products.find((p) => p.id === u.productId)?.sku}</span><StatusBadge status={u.status} /></div>)}
          </div>
        )}
      </Card>
      <Card title="Confirm printing & application">
        {po.stickerConfirmed ? (
          <Alert tone="success" title="Confirmed">MRP stickers and barcodes printed and applied{po.stickerConfirmedAt ? ` on ${fmtDate(po.stickerConfirmedAt)}` : ''}.</Alert>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Upload a photo of applied stickers (optional) and confirm that every unit carries the MRP sticker and its Btali barcode.</p>
            <FileUpload compact accept="image/*" label="Photos of applied stickers" onFiles={(a) => setPhotos((x) => [...x, ...a])} />
            {photos.length > 0 && <AttachmentList dense items={photos} onRemove={(a) => setPhotos((x) => x.filter((y) => y.id !== a.id))} />}
            <Button icon={CheckCircle2} disabled={!mine.length} onClick={async () => {
              if (!(await confirm({ title: 'Confirm sticker application', message: `I confirm MRP stickers and ${mine.length} Btali barcodes for ${po.number} are printed and applied.`, confirmText: 'Confirm' }))) return
              confirmStickers(po.id, { photos }); setPhotos([]); toast.success('Confirmation sent to Btali')
            }}>Confirm printed & applied</Button>
          </div>
        )}
      </Card>
    </div>
  )
}

function ScheduleTab({ po }) {
  const add = useStore((s) => s.vndAddDeliverySchedule)
  const remove = useStore((s) => s.vndRemoveDeliverySchedule)
  const ordered = po.lines.reduce((a, l) => a + l.qty, 0)
  const declared = (po.deliverySchedule || []).reduce((a, d) => a + (d.qty || 0), 0)
  const [f, setF] = useState({ date: '', qty: Math.max(0, ordered - declared), note: '' })
  const editable = ['APPROVED', 'PI_RECEIVED', 'IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP'].includes(po.status)
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="Declared schedule" subtitle={`${fmtNum(declared)} of ${fmtNum(ordered)} pcs scheduled`} className="lg:col-span-2" padded={false}>
        {(po.deliverySchedule || []).length === 0 ? <EmptyState title="No schedule declared" message="Tell Btali when goods will be ready for stuffing." /> : (
          <ul className="divide-y divide-slate-100">
            {po.deliverySchedule.map((d) => (
              <li key={d.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-12 text-center rounded-lg bg-brand-50 text-brand-700 py-1"><div className="text-lg font-bold leading-none">{new Date(d.date).getDate()}</div><div className="text-[10px] uppercase">{new Date(d.date).toLocaleDateString('en-GB', { month: 'short' })}</div></div>
                <div className="flex-1"><div className="text-sm font-medium">{fmtNum(d.qty)} pcs ready</div><div className="text-xs text-slate-500">{d.note || '—'}</div></div>
                {d.date < today() && <Badge tone="gray">Past</Badge>}
                {editable && <IconButton icon={Trash2} tone="danger" title="Withdraw" onClick={() => { remove(po.id, d.id); toast.info('Schedule line withdrawn') }} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Declare ready date">
        {editable ? (
          <div className="space-y-3">
            <Field label="Ready for stuffing on" required><Input type="date" min={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Quantity (pcs)" required><NumberInput value={f.qty} onChange={(v) => setF({ ...f, qty: v })} /></Field>
            <Field label="Remarks"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Pumps first, spares with balance" /></Field>
            <Button icon={CalendarPlus} onClick={() => {
              if (!f.date || !(Number(f.qty) > 0)) return toast.error('Date and quantity are required')
              add(po.id, f); setF({ date: '', qty: 0, note: '' }); toast.success('Schedule shared with Btali')
            }}>Declare schedule</Button>
          </div>
        ) : <div className="text-sm text-slate-500">This order has already shipped.</div>}
      </Card>
    </div>
  )
}

function QCTab({ po }) {
  const upload = useStore((s) => s.vndUploadQC)
  const [items, setItems] = useState([])
  const canUpload = ['IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP'].includes(po.status)
  return (
    <div className="space-y-4">
      {po.qcApprovedAt && <Alert tone="success" title="QC approved by Btali">Approved on {fmtDate(po.qcApprovedAt)} – goods cleared for shipment.</Alert>}
      {canUpload && (
        <Card title="Upload QC photos & videos" subtitle="Branding, MRP sticker, barcode, carton print and performance tests">
          <FileUpload accept="image/*,video/*" label="Drop photos / videos here or click to upload" onFiles={(a) => setItems((x) => [...x, ...a.map((file) => ({ file, caption: '' }))])} />
          {items.length > 0 && (
            <div className="mt-3 space-y-2">
              {items.map((it, i) => (
                <div key={it.file.id} className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-600 w-40 truncate">{it.file.name}</span>
                  <Input value={it.caption} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, caption: e.target.value } : y)))} placeholder="Caption, e.g. MB10 – MRP sticker & barcode" className="flex-1" />
                  <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} />
                </div>
              ))}
              <Button icon={Upload} onClick={() => { upload(po.id, items); setItems([]); toast.success('QC files submitted', 'Btali Purchase notified for review.') }}>Submit {items.length} file(s) for QC</Button>
            </div>
          )}
        </Card>
      )}
      <Card title={`Submitted QC media (${(po.qc || []).length})`}>
        {(po.qc || []).length === 0 ? <EmptyState icon={Camera} title="No QC media yet" /> : (
          <MediaGrid items={po.qc} renderActions={(m) => <><StatusBadge status={m.status} />{m.kind === 'video' && <Badge tone="ink">Video</Badge>}{m.remark && <span className="text-[11px] text-red-600 w-full">{m.remark}</span>}</>} />
        )}
      </Card>
    </div>
  )
}

function PLTab({ po }) {
  const state = useStore()
  const uploadCI = useStore((s) => s.vndUploadCommercialInvoice)
  const nav = useNavigate()
  const sum = useMemo(() => packingSummary(state, po.id), [state.units, state.purchaseOrders]) // eslint-disable-line
  const [f, setF] = useState({ number: '', amount: poTotal(po) })
  const [file, setFile] = useState(null)
  const pl = po.packingList
  return (
    <div className="space-y-4">
      <Card title="Barcode-scan packing status" actions={['IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP'].includes(po.status) && <Button size="sm" icon={ScanLine} onClick={() => nav(`/vendor/scan-pack?po=${po.id}`)}>Open scan-to-pack</Button>}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-sm">
          {[['Barcodes scanned', `${sum.totals.packed} / ${sum.totals.barcodes}`], ['Packed qty', fmtNum(sum.totals.qty)], ['CBM', fmtNum(sum.totals.cbm)], ['Gross weight', `${fmtNum(sum.totals.weight)} kg`]].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-slate-500">{k}</div><div className="font-bold text-ink-900">{v}</div></div>)}
        </div>
        {sum.totals.barcodes === 0 && <Alert tone="info">Packing is recorded by scanning the Btali barcodes during loading. Barcodes appear here once issued.</Alert>}
      </Card>
      <Card title="Final packing list" subtitle={pl?.generatedAt ? `Generated ${fmtDate(pl.generatedAt)} from ${pl.scanned?.length || 0} barcode scans` : 'Not generated yet'}
        actions={pl?.lines?.length > 0 && <Button size="sm" variant="secondary" icon={Download} onClick={() => exportCSV(`packing-list-${po.number.replace(/\//g, '-')}.csv`, pl.lines, [{ header: 'SKU', value: (l) => state.products.find((p) => p.id === l.productId)?.sku }, { header: 'Item', value: (l) => state.products.find((p) => p.id === l.productId)?.name }, { header: 'Qty', value: (l) => l.qty }, { header: 'Cartons', value: (l) => l.cartons }, { header: 'CBM', value: (l) => l.cbm }, { header: 'Weight kg', value: (l) => l.weight }])}>Download</Button>}>
        {pl?.lines?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Cartons</th><th className="text-right px-3 py-2">CBM</th><th className="text-right px-3 py-2">Weight (kg)</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{pl.lines.map((l) => <tr key={l.productId}><td className="px-3 py-2"><ProductCell id={l.productId} /></td><td className="px-3 py-2 text-right">{fmtNum(l.qty)}</td><td className="px-3 py-2 text-right">{fmtNum(l.cartons)}</td><td className="px-3 py-2 text-right">{fmtNum(l.cbm)}</td><td className="px-3 py-2 text-right">{fmtNum(l.weight)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <div className="text-sm text-slate-500">Generate the final packing list from Scan-to-Pack after loading.</div>}
      </Card>
      <Card title="Commercial invoice">
        {po.commercialInvoice ? (
          <div className="space-y-2">
            <AttachmentList items={[{ ...po.commercialInvoice, docType: `CI ${po.commercialInvoice.ciNumber || ''}${po.commercialInvoice.amount ? ` · ${fmtUSD(po.commercialInvoice.amount, po.currency)}` : ''}` }]} />
            <div className="text-xs text-slate-500">Uploading a new invoice will replace the current copy.</div>
          </div>
        ) : null}
        <div className="mt-3 space-y-3">
          <FormGrid cols={2}>
            <Field label="CI number"><Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
            <Field label={`Invoice value (${po.currency})`}><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          </FormGrid>
          {file ? <AttachmentList items={[file]} onRemove={() => setFile(null)} /> : <FileUpload compact multiple={false} accept=".pdf,image/*" label="Upload commercial invoice" onFiles={(a) => setFile(a[0])} />}
          <Button icon={Upload} disabled={!file || !f.number.trim()} onClick={() => { uploadCI(po.id, { number: f.number.trim(), amount: f.amount, file }); setFile(null); setF({ number: '', amount: poTotal(po) }); toast.success('Commercial invoice uploaded') }}>Upload CI</Button>
        </div>
      </Card>
    </div>
  )
}

function ImprovementsTab({ po }) {
  const declare = useStore((s) => s.vndDeclareImprovement)
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="Declared improvements" className="lg:col-span-2" padded={false}>
        {(po.improvements || []).length === 0 ? <EmptyState icon={Lightbulb} title="No changes declared" message="Log any design, material or packaging change before delivery." /> : (
          <ul className="divide-y divide-slate-100">
            {po.improvements.map((im) => (
              <li key={im.id} className="px-4 py-3 flex items-start gap-3">
                <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1"><div className="text-sm">{im.text}</div><div className="text-[11px] text-slate-400">{fmtDate(im.date)}</div>{im.attachments?.length > 0 && <div className="mt-1"><AttachmentList dense items={im.attachments} /></div>}</div>
                <Badge tone={im.ack ? 'green' : 'amber'}>{im.ack ? 'Acknowledged' : 'Pending review'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Declare an improvement">
        <div className="space-y-3">
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. MB10 – upgraded to copper-winding motor, same dimensions, no price change" />
          <FileUpload compact label="Drawings / photos (optional)" onFiles={(a) => setFiles((x) => [...x, ...a])} />
          {files.length > 0 && <AttachmentList dense items={files} />}
          <Button icon={Send} disabled={text.trim().length < 5} onClick={() => { declare(po.id, { text: text.trim(), attachments: files }); setText(''); setFiles([]); toast.success('Improvement declared to Btali') }}>Submit</Button>
        </div>
      </Card>
    </div>
  )
}

function FinanceTab({ po }) {
  const vendorDocs = useStore((s) => s.vendorDocs) || []
  const shipment = useStore((s) => s.shipments.find((x) => x.id === po.shipmentId))
  const uploadDoc = useStore((s) => s.vndUploadFinanceDoc)
  const [type, setType] = useState('TELEX')
  const swift = [...vendorDocs.filter((d) => d.poId === po.id && d.docType === 'SWIFT'), ...(po.docs || []).filter((d) => /swift/i.test(d.docType || d.name)).map((d) => ({ id: d.id, title: d.name, file: d, date: d.uploadedAt }))]
  const locker = po.docs || []
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Payments from Btali (SWIFT copies)" padded={false}>
        {swift.length === 0 ? <EmptyState icon={Banknote} title="No payment against this PO yet" /> : (
          <ul className="divide-y divide-slate-100">
            {swift.map((d) => (
              <li key={d.id} className="px-4 py-3 flex items-center gap-3">
                <Banknote className="w-4 h-4 text-emerald-500" />
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{d.title}</div><div className="text-[11px] text-slate-500">{d.date ? fmtDate(d.date) : ''}{d.ref ? ` · ${d.ref}` : ''}</div></div>
                {d.amount != null && <span className="text-sm font-semibold tabular-nums">{fmtUSD(d.amount, d.currency)}</span>}
                <Button size="sm" variant="link" onClick={() => openAttachment(d.file)}>View</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Upload release & shipping documents">
        {shipment && (
          <div className="mb-3 text-sm">
            <span className="text-slate-500">Telex release status: </span>
            {shipment.telexReleased || po.telexUploadedAt ? <Badge tone="green">Released</Badge> : <Badge tone="amber">Pending</Badge>}
          </div>
        )}
        <div className="space-y-3">
          <Field label="Document type"><Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: 'TELEX', label: 'Telex release' }, { value: 'BL', label: 'Bill of lading (draft / final)' }, { value: 'COO', label: 'Certificate of origin' }, { value: 'INSURANCE', label: 'Insurance certificate' }, { value: 'OTHER', label: 'Other' }]} /></Field>
          <FileUpload compact multiple={false} label="Upload document" onFiles={(a) => { uploadDoc(po.id, { docType: type, file: a[0] }); toast.success(type === 'TELEX' ? 'Telex release uploaded' : 'Document uploaded', 'Btali Purchase & Accounts notified.') }} />
        </div>
      </Card>
      <Card title="Document locker" subtitle="All documents on this order" className="lg:col-span-2"><AttachmentList items={locker} empty="No documents yet." /></Card>
    </div>
  )
}

function ForwarderTab({ po }) {
  const state = useStore()
  const { forwarder, shipment, indian, rfq } = forwarderFor(state, po)
  if (!forwarder) return <Card><EmptyState icon={Ship} title="Forwarder not nominated yet" message="Btali nominates the freight forwarder after QC approval and container planning. You will be notified here." /></Card>
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Origin forwarder (China)">
        <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><Truck className="w-5 h-5" /></div><div><div className="font-semibold">{forwarder.name}</div><div className="text-xs text-slate-500">{forwarder.city}, {forwarder.country}</div></div></div>
        <DescriptionList items={[['Contact', forwarder.contact], ['Phone', forwarder.phone], ['Email', forwarder.email], ['Selected via', rfq ? rfq.number : 'Btali contract rate']]} />
      </Card>
      <Card title="Booking">
        {shipment ? (
          <DescriptionList items={[['Shipment', shipment.number], ['Container', `${shipment.containerNo || '—'} (${shipment.containerType})`], ['B/L', shipment.blNo], ['ETD', fmtDate(shipment.etd)], ['ETA India', fmtDate(shipment.eta)], ['Status', <StatusBadge key="s" status={shipment.status} />], ['Destination agent', indian?.name]]} />
        ) : <div className="text-sm text-slate-500">Booking will be confirmed by the forwarder. Please coordinate stuffing date as per your declared schedule.</div>}
      </Card>
    </div>
  )
}
