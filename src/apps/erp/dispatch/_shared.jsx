// Shared Dispatch / Starex building blocks: tax invoice document, invoice drawer, LR upload modal,
// schedule builder, MIS upload + reconciliation views.
import React, { useMemo, useState } from 'react'
import { Mail, Truck, FileText, Download, Upload, CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  Button, Badge, StatusBadge, Drawer, Modal, Field, FormGrid, Input, Select, FileUpload, AttachmentList, DescriptionList, Alert, Tabs,
  Timeline, SectionTitle, Stat, Grid, Card, toast, prompt, openAttachment, cx,
} from '../../../components/ui'
import { PrintArea, DocHeader, ProductCell, PartnerCell, BarsChart, DonutChart } from '../../../components/business'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtNum, fmtDate, fmtDateTime, today, addDays, daysBetween, round2, sum, exportCSV, parseCSV, toCSV, downloadText, makeAttachment, daysAgo } from '../../../lib/format'
import { invoiceWeight, invoiceCbm, invoiceQty, misSummary, buildMisRows } from '../../../store/slices/dispatch'

export { invoiceWeight, invoiceCbm, invoiceQty }

// ------------------------------------------------------------------ amount in words (Indian system)
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`)
const three = (n) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? two(n % 100) : ''}`
export const amountInWords = (amt) => {
  let n = Math.round(amt || 0)
  if (!n) return 'Rupees Zero Only'
  const parts = []
  const cr = Math.floor(n / 1e7); n %= 1e7
  const lk = Math.floor(n / 1e5); n %= 1e5
  const th = Math.floor(n / 1e3); n %= 1e3
  if (cr) parts.push(`${three(cr)} Crore`)
  if (lk) parts.push(`${two(lk)} Lakh`)
  if (th) parts.push(`${two(th)} Thousand`)
  if (n) parts.push(three(n))
  return `Rupees ${parts.join(' ')} Only`
}

export const isIntraState = (partner) => (partner?.state || '') === 'Maharashtra'
export const lrAgeDays = (inv) => daysBetween(inv.date, inv.lr?.date || today())

// ------------------------------------------------------------------ GST tax invoice document
export function TaxInvoiceDoc({ inv }) {
  const { partner, product, transporter } = useLookup()
  const p = partner(inv.partnerId)
  const tr = transporter(inv.transporterId)
  const intra = isIntraState(p)
  const title = inv.type === 'FOC' ? 'Delivery Challan (FOC)' : 'Tax Invoice'
  const hsnRows = Object.values(inv.lines.reduce((m, l) => {
    const pr = product(l.productId)
    const k = pr?.hsn || '—'
    m[k] = m[k] || { hsn: k, taxable: 0 }
    m[k].taxable += l.amount ?? l.qty * l.price
    return m
  }, {}))
  return (
    <PrintArea title={`${title} ${inv.number}`}>
      <DocHeader title={title} number={inv.number} date={inv.date} right={inv.irn ? <div className="text-[10px] text-slate-500 mt-1 font-mono">IRN {inv.irn}<br />e-Way Bill {inv.ewayBill}</div> : null} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs mb-4">
        <div>
          <div className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-1">Bill to / Ship to</div>
          <div className="font-semibold text-slate-900 text-sm">{p?.name}</div>
          <div className="text-slate-600">{p?.address}<br />{p?.city}, {p?.state} {p?.pincode}</div>
          <div className="text-slate-600 mt-1">GSTIN {p?.gstin}</div>
        </div>
        <div>
          <div className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-1">Dispatch</div>
          <div className="text-slate-700">From: {inv.locationId === 'WH-GUJ' ? 'Gujarat Facility, Rajkot' : 'Starex 3PL, Bhiwandi'}</div>
          <div className="text-slate-700">Transporter: {tr?.name || '—'}</div>
          <div className="text-slate-700">Vehicle: {inv.vehicleNo || '—'}</div>
          {inv.lr && <div className="text-slate-700">LR: {inv.lr.number} ({fmtDate(inv.lr.date)})</div>}
        </div>
        <div>
          <div className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-1">Terms</div>
          <div className="text-slate-700">Place of supply: {p?.state}</div>
          <div className="text-slate-700">Payment: Advance received</div>
          {inv.againstInvoice && <div className="text-slate-700">Against invoice: {inv.againstInvoice}</div>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border border-slate-200">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left p-2 border-b">#</th><th className="text-left p-2 border-b">Description</th><th className="text-left p-2 border-b">HSN</th>
              <th className="text-right p-2 border-b">Qty</th><th className="text-right p-2 border-b">Rate</th><th className="text-right p-2 border-b">Taxable value</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => {
              const pr = product(l.productId)
              return (
                <tr key={i} className="border-b border-slate-100">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2"><div className="font-medium text-slate-800">{pr?.name}</div><div className="text-slate-500">{pr?.sku}{l.free ? ' · Free of cost' : ''}</div></td>
                  <td className="p-2">{pr?.hsn}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(l.qty)} {pr?.uom}</td>
                  <td className="p-2 text-right tabular-nums">{fmtINR(l.price, true)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtINR(l.amount ?? l.qty * l.price, true)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col md:flex-row justify-between gap-4 mt-3">
        <table className="text-[11px] border border-slate-200 self-start">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="p-1.5 text-left">HSN</th><th className="p-1.5 text-right">Taxable</th>{intra ? <><th className="p-1.5 text-right">CGST 9%</th><th className="p-1.5 text-right">SGST 9%</th></> : <th className="p-1.5 text-right">IGST 18%</th>}</tr></thead>
          <tbody>
            {hsnRows.map((h) => (
              <tr key={h.hsn}><td className="p-1.5">{h.hsn}</td><td className="p-1.5 text-right tabular-nums">{fmtINR(h.taxable, true)}</td>
                {intra ? <><td className="p-1.5 text-right tabular-nums">{fmtINR(h.taxable * 0.09, true)}</td><td className="p-1.5 text-right tabular-nums">{fmtINR(h.taxable * 0.09, true)}</td></> : <td className="p-1.5 text-right tabular-nums">{fmtINR(h.taxable * 0.18, true)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-sm min-w-[240px] space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Taxable value</span><span className="tabular-nums">{fmtINR(inv.subtotal, true)}</span></div>
          {intra ? (
            <>
              <div className="flex justify-between"><span className="text-slate-500">CGST @9%</span><span className="tabular-nums">{fmtINR(inv.gst / 2, true)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">SGST @9%</span><span className="tabular-nums">{fmtINR(inv.gst / 2, true)}</span></div>
            </>
          ) : <div className="flex justify-between"><span className="text-slate-500">IGST @18%</span><span className="tabular-nums">{fmtINR(inv.gst, true)}</span></div>}
          <div className="flex justify-between font-bold border-t border-slate-200 pt-1"><span>Invoice total</span><span className="tabular-nums">{fmtINR(inv.total, true)}</span></div>
        </div>
      </div>
      <div className="text-xs text-slate-600 mt-3"><span className="font-semibold">Amount in words:</span> {amountInWords(inv.total)}</div>
      <div className="flex justify-between items-end mt-8 text-xs text-slate-500">
        <div>Goods once sold will be covered under Btali warranty terms.<br />Subject to Navi Mumbai jurisdiction. This is a computer-generated document.</div>
        <div className="text-right"><div className="font-semibold text-slate-700">For Btali International Pvt. Ltd.</div><div className="mt-6">Authorised Signatory</div></div>
      </div>
    </PrintArea>
  )
}

// ------------------------------------------------------------------ invoice drawer
export function InvoiceDrawer({ invoiceId, onClose, onUploadLR }) {
  const inv = useStore((s) => s.invoices.find((x) => x.id === invoiceId))
  const so = useStore((s) => s.salesOrders.find((x) => x.id === inv?.soId))
  const products = useStore((s) => s.products)
  const notes = useStore((s) => s.notes || [])
  const emails = useStore((s) => s.emails)
  const resend = useStore((s) => s.resendInvoiceEmail)
  const { partner, transporter } = useLookup()
  const [tab, setTab] = useState('doc')
  if (!inv) return null
  const p = partner(inv.partnerId)
  const dn = notes.find((n) => n.invoiceId === inv.id && n.source === 'SAFEX')
  const mails = emails.filter((e) => e.ref === inv.number)
  return (
    <Drawer open onClose={onClose} width="max-w-4xl" title={`${inv.type === 'FOC' ? 'FOC' : 'Invoice'} ${inv.number}`}
      subtitle={<span className="flex items-center gap-2 flex-wrap">{p?.name} · {fmtDate(inv.date)} <StatusBadge status={inv.status} />{inv.safex && <Badge tone="violet">Safex</Badge>}{inv.type === 'FOC' && <Badge tone="amber">FOC</Badge>}</span>}
      footer={<>
        <Button variant="secondary" icon={Mail} onClick={() => { resend(inv.id); toast.success('Invoice re-sent', `Emailed to ${p?.email}`) }}>Resend to client</Button>
        {inv.lr?.file && <Button variant="secondary" icon={Download} onClick={() => openAttachment(inv.lr.file)}>LR copy</Button>}
        {!inv.lr && onUploadLR && <Button icon={Upload} onClick={() => onUploadLR(inv.id)}>Upload LR</Button>}
      </>}>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'doc', label: 'Tax invoice' }, { key: 'dispatch', label: 'Dispatch & LR' }, { key: 'comms', label: 'Emails', count: mails.length }]} />
      {tab === 'doc' && <TaxInvoiceDoc inv={inv} />}
      {tab === 'dispatch' && (
        <div className="space-y-5">
          <DescriptionList cols={3} items={[
            ['Sales order', so?.number], ['Transporter', transporter(inv.transporterId)?.name], ['Vehicle', inv.vehicleNo || '—'],
            ['Scheduled dispatch', fmtDate(inv.dispatchDate)], ['Weight', `${fmtNum(invoiceWeight(inv, products))} kg`], ['Volume', `${fmtNum(invoiceCbm(inv, products))} CBM`],
            ['Starex', inv.starexStage ? inv.starexStage.toLowerCase() : inv.sentToStarex ? 'In schedule' : '—'], ['LR number', inv.lr?.number || 'Awaiting'], ['LR date', inv.lr ? fmtDate(inv.lr.date) : '—'],
            ['Lead time (invoice → LR)', inv.lr ? `${lrAgeDays(inv)} day(s)` : `${lrAgeDays(inv)} day(s) open`], ['IRN', inv.irn || '—'], ['e-Way bill', inv.ewayBill || '—'],
          ]} />
          {inv.lr ? (
            <Alert tone={lrAgeDays(inv) <= 2 ? 'success' : 'warn'} title={`LR ${inv.lr.number} shared with client`}>
              Uploaded {fmtDateTime(inv.lr.uploadedAt || inv.lr.date)} · {lrAgeDays(inv) <= 2 ? 'within' : 'outside'} 48-hour SLA. Visible to Sales and on the dealer portal.
            </Alert>
          ) : <Alert tone="warn" title="LR pending">Upload the LR once Starex loads the vehicle – the client and Sales are emailed automatically.</Alert>}
          {inv.lr?.file && <AttachmentList items={[inv.lr.file]} />}
          {dn && (
            <div>
              <SectionTitle>Safex debit note</SectionTitle>
              <div className="border border-violet-200 bg-violet-50/50 rounded-lg p-3 text-sm flex justify-between"><span>{dn.number} · {dn.reason}</span><span className="font-semibold tabular-nums">{fmtINR(dn.total ?? dn.amount)}</span></div>
            </div>
          )}
          <div>
            <SectionTitle>Order timeline</SectionTitle>
            <Timeline items={[...(so?.timeline || [])].reverse()} />
          </div>
        </div>
      )}
      {tab === 'comms' && (
        mails.length ? (
          <ul className="space-y-2">
            {mails.map((m) => (
              <li key={m.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex justify-between gap-2 text-sm"><span className="font-medium text-slate-800">{m.subject}</span><span className="text-xs text-slate-400 shrink-0">{fmtDateTime(m.ts)}</span></div>
                <div className="text-xs text-slate-500">To {m.to}</div>
                <div className="text-xs text-slate-600 whitespace-pre-line mt-1">{m.body}</div>
              </li>
            ))}
          </ul>
        ) : <div className="text-sm text-slate-500">Invoice emailed to {p?.email} at generation. Use “Resend to client” to send another copy.</div>
      )}
    </Drawer>
  )
}

// ------------------------------------------------------------------ LR upload modal
export function LRUploadModal({ invoiceId, onClose }) {
  const inv = useStore((s) => s.invoices.find((x) => x.id === invoiceId))
  const uploadLR = useStore((s) => s.uploadLR)
  const { partner, transporter } = useLookup()
  const [f, setF] = useState(() => ({ lrNo: '', date: today(), vehicleNo: inv?.vehicleNo || transporter(inv?.transporterId)?.vehicleNo || '', file: null }))
  if (!inv) return null
  const p = partner(inv.partnerId)
  const save = () => {
    if (!f.lrNo.trim()) return toast.error('LR number is required')
    if (!f.file) return toast.error('Attach the LR copy')
    uploadLR(inv.id, { lrNo: f.lrNo.trim().toUpperCase(), date: f.date, file: f.file, vehicleNo: f.vehicleNo })
    toast.success('LR uploaded & emailed', `${inv.number} marked dispatched · sent to ${p?.email} and Sales`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Upload LR – ${inv.number}`} subtitle={`${p?.name} · ${transporter(inv.transporterId)?.name || ''}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Upload} onClick={save}>Upload & email client</Button></>}>
      <FormGrid cols={3}>
        <Field label="LR number" required><Input value={f.lrNo} onChange={(e) => setF({ ...f, lrNo: e.target.value })} placeholder="e.g. OSR/24518" autoFocus /></Field>
        <Field label="LR date" required><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Vehicle no."><Input value={f.vehicleNo} onChange={(e) => setF({ ...f, vehicleNo: e.target.value.toUpperCase() })} /></Field>
      </FormGrid>
      <div className="mt-4">
        {f.file ? <AttachmentList items={[f.file]} onRemove={() => setF({ ...f, file: null })} />
          : <FileUpload multiple={false} accept="image/*,application/pdf" label="Drop LR copy (PDF / photo) or click to upload" onFiles={(a) => setF({ ...f, file: { ...a[0], docType: 'LR' } })} />}
      </div>
      <p className="text-xs text-slate-500 mt-3">On upload the invoice and sales order move to Dispatched, the LR is emailed to {p?.email}, Sales is notified and the LR appears on the dealer portal.</p>
    </Modal>
  )
}

// ------------------------------------------------------------------ dispatch schedule
/** ISSUED invoices due on or before `date` (carry-overs included), Starex-handled only */
export const scheduleInvoices = (invoices, date) =>
  invoices.filter((i) => i.status === 'ISSUED' && i.locationId !== 'WH-GUJ' && (i.dispatchDate || addDays(i.date, 1)) <= date)
    .sort((a, b) => (a.dispatchDate < b.dispatchDate ? -1 : 1))

export const scheduleRows = (invs, { products, partners, transporters }) => invs.flatMap((inv) => inv.lines.map((l) => {
  const pr = products.find((p) => p.id === l.productId)
  return {
    invoiceId: inv.id, invoice: inv.number, type: inv.type, date: inv.dispatchDate,
    customer: partners.find((p) => p.id === inv.partnerId)?.name, city: partners.find((p) => p.id === inv.partnerId)?.city,
    transporter: transporters.find((t) => t.id === inv.transporterId)?.name || 'Unassigned',
    sku: pr?.sku, product: pr?.shortName, qty: l.qty, weight: round2((pr?.weightKg || 0) * l.qty), cbm: round2((pr?.cbm || 0) * l.qty),
  }
}))

export const SCHEDULE_COLS = [
  { key: 'transporter', header: 'Transporter' }, { key: 'invoice', header: 'Invoice No' }, { key: 'customer', header: 'Customer' }, { key: 'city', header: 'City' },
  { key: 'sku', header: 'SKU' }, { key: 'product', header: 'Product' }, { key: 'qty', header: 'Qty' }, { key: 'weight', header: 'Weight (kg)' }, { key: 'cbm', header: 'CBM' },
]
export const scheduleCSV = (rows) => toCSV(rows, SCHEDULE_COLS)

// ------------------------------------------------------------------ MIS / reconciliation
export const MIS_KIND = { WEEKLY_TRUCK: 'Weekly truck report', MONTHLY_MIS: 'Monthly MIS', INVOICE: 'Transport invoice' }

export function MisUploadModal({ onClose, onDone, defaultSource = 'STAREX' }) {
  const state = useStore()
  const uploadMIS = useStore((s) => s.uploadMIS)
  const [kind, setKind] = useState('WEEKLY_TRUCK')
  const [source, setSource] = useState(defaultSource)
  const [period, setPeriod] = useState(`${fmtDate(daysAgo(7))} – ${fmtDate(daysAgo(1))}`)
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState(null)
  const onFiles = async (atts) => {
    const a = atts[0]
    try {
      const text = a.url?.startsWith('data:') ? decodeURIComponent(escape(atob(a.url.split(',')[1]))) : await (await fetch(a.url)).text()
      const parsed = parseCSV(text)
      if (!parsed.length) return toast.error('No rows found', 'Upload a CSV export of the Starex report (first row = headers).')
      setRows(parsed)
      setFile(a)
      const dates = parsed.map((r) => r.Date || r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
      if (dates.length) setPeriod(`${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`)
    } catch {
      toast.error('Could not read file', 'Save the Excel sheet as CSV and upload again.')
    }
  }
  const downloadSample = () => {
    const to = daysAgo(1), from = daysAgo(kind === 'MONTHLY_MIS' ? 30 : 7)
    const r = buildMisRows(state, from, to, { inject: true, seed: Math.floor(Date.now() / 1000) % 7 + 3 })
    downloadText(`Starex-${kind === 'MONTHLY_MIS' ? 'MIS' : 'Truck-Report'}-${to}.csv`, toCSV(r, Object.keys(r[0] || { Date: 1 }).map((k) => ({ key: k, header: k }))), 'text/csv')
    toast.info('Template downloaded', `${r.length} consignments from ${fmtDate(from)} – ${fmtDate(to)}. Upload it here to reconcile.`)
  }
  const submit = () => {
    if (!rows) return toast.error('Attach the report file first')
    const up = uploadMIS({ source, kind, period, fileName: file.name, rows, file: { id: file.id, name: file.name, size: file.size, type: file.type, uploadedAt: file.uploadedAt } })
    const sm = misSummary(up.results)
    toast[sm.open ? 'warn' : 'success']('Report reconciled', `${sm.MATCH} matched · ${sm.MISMATCH} mismatch · ${sm.EXTRA} extra · ${sm.MISSING} missing`)
    onDone?.(up)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Upload transport report" subtitle="Weekly truck report or monthly MIS – auto-matched against ERP invoices"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={CheckCircle2} disabled={!rows} onClick={submit}>Upload & reconcile</Button></>}>
      <FormGrid cols={3}>
        <Field label="Report type"><Select value={kind} onChange={(e) => setKind(e.target.value)} options={Object.entries(MIS_KIND).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Source"><Select value={source} onChange={(e) => setSource(e.target.value)} options={[{ value: 'STAREX', label: 'Starex 3PL' }, { value: 'SAFEX', label: 'Safex Transport' }]} /></Field>
        <Field label="Period"><Input value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
      </FormGrid>
      <div className="mt-4">
        {file ? <AttachmentList items={[file]} onRemove={() => { setFile(null); setRows(null) }} />
          : <FileUpload multiple={false} accept=".csv,text/csv" label="Drop the report CSV here or click to upload" hint="Columns: Date, Invoice No, Customer, LR No, Vehicle No, Trucks, Freight" onFiles={onFiles} />}
      </div>
      {rows && <Alert className="mt-3" tone="info" title={`${rows.length} rows read`}>Columns detected: {Object.keys(rows[0]).join(', ')}</Alert>}
      <div className="mt-4 flex items-center justify-between gap-3 border border-dashed border-slate-300 rounded-lg p-3">
        <div className="text-xs text-slate-600"><span className="font-semibold text-slate-800">Need the format?</span> Download the Starex template pre-filled with recent dispatches.</div>
        <Button size="sm" variant="soft" icon={FileSpreadsheet} onClick={downloadSample}>Download template</Button>
      </div>
    </Modal>
  )
}

const RESULT_TONE = { MATCH: 'green', MISMATCH: 'red', MISSING: 'amber', EXTRA: 'violet' }
export function MisResults({ upload, canResolve = true, onOpenInvoice }) {
  const resolve = useStore((s) => s.resolveMisResult)
  const { partner } = useLookup()
  const invoices = useStore((s) => s.invoices)
  const [filter, setFilter] = useState('EXCEPTIONS')
  const sm = misSummary(upload.results)
  const rows = upload.results.map((r, i) => ({ ...r, idx: i, id: `${upload.id}-${i}`, partnerId: invoices.find((x) => x.id === r.invoiceId)?.partnerId }))
  const view = filter === 'ALL' ? rows : filter === 'EXCEPTIONS' ? rows.filter((r) => r.status !== 'MATCH') : rows.filter((r) => r.status === filter)
  const doResolve = async (r) => {
    const note = await prompt({ title: `Resolve ${r.ref}`, label: 'Resolution note', placeholder: 'e.g. Starex agreed to credit ₹650 in next bill', required: true })
    if (!note) return
    resolve(upload.id, r.idx, note)
    toast.success('Exception resolved', r.ref)
  }
  return (
    <div className="space-y-4">
      <Grid cols={5}>
        <Stat label="Lines checked" value={fmtNum(sm.total)} sub={`${sm.accuracy}% accurate`} tone="ink" />
        <Stat label="Matched" value={fmtNum(sm.MATCH)} tone="green" />
        <Stat label="Over / under charged" value={fmtNum(sm.MISMATCH)} tone="red" />
        <Stat label="Extra (not in ERP)" value={fmtNum(sm.EXTRA)} tone="violet" />
        <Stat label="Missing in report" value={fmtNum(sm.MISSING)} tone="amber" />
      </Grid>
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Starex reported freight</div><div className="text-lg font-bold tabular-nums">{fmtINR(sm.billed)}</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">ERP expected (rate card / recorded)</div><div className="text-lg font-bold tabular-nums">{fmtINR(sm.expected)}</div></div>
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-3"><div className="text-xs text-red-700">Over-billing flagged</div><div className="text-lg font-bold tabular-nums text-red-700">{fmtINR(sm.overbilled)}</div></div>
      </div>
      <DataTable rows={view} pageSize={10} exportName={`reconciliation-${upload.fileName.replace(/\.csv$/i, '')}`}
        toolbar={<Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44" options={[{ value: 'EXCEPTIONS', label: 'Exceptions only' }, { value: 'ALL', label: 'All lines' }, { value: 'MATCH', label: 'Matched' }, { value: 'MISMATCH', label: 'Mismatch' }, { value: 'EXTRA', label: 'Extra' }, { value: 'MISSING', label: 'Missing' }]} />}
        empty={<div className="text-center text-sm text-emerald-700 py-8">All lines reconcile with ERP – no exceptions.</div>}
        columns={[
          { key: 'ref', header: 'Invoice', render: (r) => r.invoiceId && onOpenInvoice ? <button className="font-mono text-xs text-brand-600 hover:underline whitespace-nowrap" onClick={() => onOpenInvoice(r.invoiceId)}>{r.ref}</button> : <span className="font-mono text-xs whitespace-nowrap">{r.ref}</span> },
          { key: 'customer', header: 'Customer', value: (r) => partner(r.partnerId)?.name || '—' },
          { key: 'status', header: 'Result', render: (r) => <Badge tone={RESULT_TONE[r.status]} dot>{r.status === 'MISMATCH' ? (r.diff > 0 ? 'Over-charged' : r.diff < 0 ? 'Under-charged' : 'Mismatch') : r.status === 'EXTRA' ? 'Extra (billed)' : r.status === 'MISSING' ? 'Missing' : 'Match'}</Badge> },
          { key: 'trucks', header: 'Trucks', align: 'right' },
          { key: 'amount', header: 'Starex', align: 'right', render: (r) => fmtINR(r.amount) },
          { key: 'expected', header: 'ERP', align: 'right', render: (r) => fmtINR(r.expected) },
          { key: 'diff', header: 'Difference', align: 'right', render: (r) => <span className={cx(r.diff > 0 ? 'text-red-600' : r.diff < 0 ? 'text-amber-700' : 'text-slate-500', 'font-medium')}>{r.diff > 0 ? '+' : ''}{fmtINR(r.diff)}</span> },
          { key: 'note', header: 'Finding', className: 'max-w-xs', render: (r) => <div className="text-xs text-slate-600">{r.note}{r.resolved && <div className="text-emerald-700 mt-0.5">Resolved: {r.resolution}</div>}</div> },
          { key: 'act', header: '', sortable: false, export: false, render: (r) => r.status === 'MATCH' ? null : r.resolved ? <Badge tone="green">Resolved</Badge> : canResolve ? <Button size="sm" variant="secondary" onClick={() => doResolve(r)}>Resolve</Button> : <Badge tone="amber">With Dispatch</Badge> },
        ]} />
    </div>
  )
}

export function MisHistoryTable({ uploads, onOpen }) {
  return (
    <DataTable rows={uploads} pageSize={8} searchable={false} onRowClick={onOpen}
      columns={[
        { key: 'fileName', header: 'File', render: (u) => <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-slate-400" /><span className="text-sm font-medium text-slate-800">{u.fileName}</span></div> },
        { key: 'kind', header: 'Type', value: (u) => MIS_KIND[u.kind] || u.kind },
        { key: 'source', header: 'Source', render: (u) => <Badge tone={u.source === 'SAFEX' ? 'violet' : 'ink'}>{u.source === 'STAREX' ? 'Starex' : 'Safex'}</Badge> },
        { key: 'period', header: 'Period' },
        { key: 'uploadedAt', header: 'Uploaded', render: (u) => fmtDateTime(u.uploadedAt) },
        { key: 'lines', header: 'Lines', align: 'right', value: (u) => u.results.length },
        { key: 'exc', header: 'Open exceptions', align: 'right', value: (u) => misSummary(u.results).open, render: (u) => { const o = misSummary(u.results).open; return <span className={o ? 'text-red-600 font-semibold' : 'text-emerald-600'}>{o}</span> } },
        { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status === 'OPEN' ? 'MISMATCH' : 'MATCHED'} label={u.status === 'OPEN' ? 'Exceptions open' : u.status === 'RESOLVED' ? 'Resolved' : 'Matched'} /> },
      ]} />
  )
}

export function MisChart({ uploads }) {
  const data = [...uploads].reverse().slice(-8).map((u) => {
    const sm = misSummary(u.results)
    return { label: `${u.kind === 'MONTHLY_MIS' ? 'MIS' : 'Wk'} ${fmtDate(u.uploadedAt).slice(0, 6)}`, reported: sm.billed, erp: sm.expected }
  })
  return <BarsChart data={data} height={240} series={[{ key: 'reported', label: 'Starex reported' }, { key: 'erp', label: 'ERP actual' }]} />
}
