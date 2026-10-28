import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Truck, RotateCcw, XCircle, IndianRupee, Receipt, ShoppingCart, Clock, CheckCircle2, PackageCheck, CalendarClock } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, StatusBadge, Drawer, Modal, Field, Input, NumberInput, Select, Textarea, FormGrid, FileUpload, AttachmentList, Timeline, Alert, Grid, Stat, SectionTitle, toast, prompt, openAttachment } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { OrderLines } from '../../components/business'
import { fmtINR, fmtDate, fmtNum, today, sum, daysAgo, timeAgo } from '../../lib/format'
import { usePortal, OrderStepper, SO_LABEL, balanceDue, BankBox, InvoiceDoc, LRDoc, fulfilment, useStockState } from './_portal'
import { ProductCell } from '../../components/business'

const OPEN = ['PENDING_REVIEW', 'CONFIRMED', 'PAID', 'INVOICED']

export default function Orders() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const { partnerId, partner, base } = usePortal()
  const allSOs = useStore((s) => s.salesOrders)
  const invoices = useStore((s) => s.invoices)
  const sst = useStockState()
  const ful = (o) => fulfilment(o, invoices, sst)
  const orders = useMemo(() => allSOs.filter((o) => o.partnerId === partnerId).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number)), [allSOs, partnerId])
  const openId = sp.get('so')
  const setOpen = (id) => { const n = new URLSearchParams(sp); if (id) n.set('so', id); else n.delete('so'); setSp(n, { replace: true }) }
  const sel = orders.find((o) => o.id === openId)

  const inProgress = orders.filter((o) => OPEN.includes(o.status) || (o.status === 'DISPATCHED' && o.date >= daysAgo(15)))
  const awaiting = orders.filter((o) => o.status === 'CONFIRMED' && balanceDue(o) > 0)
  const fyStart = `${today().slice(0, 4) - (Number(today().slice(5, 7)) < 4 ? 1 : 0)}-04-01`
  const fy = orders.filter((o) => o.date >= fyStart && o.status !== 'CANCELLED')

  return (
    <div>
      <PageHeader title="My orders" subtitle={`${orders.length} orders with Btali · ${partner?.name}`} actions={<Button icon={ShoppingCart} onClick={() => nav(`${base}/catalog`)}>New order</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={Clock} tone="amber" label="In progress" value={fmtNum(orders.filter((o) => OPEN.includes(o.status)).length)} sub={`${orders.filter((o) => o.status === 'PENDING_REVIEW').length} under review`} />
        <Stat icon={IndianRupee} tone="red" label="Payment due" value={fmtINR(sum(awaiting, balanceDue))} sub={`${awaiting.length} order(s)`} />
        <Stat icon={Truck} tone="blue" label="Dispatched 15d" value={fmtNum(orders.filter((o) => ['DISPATCHED', 'DELIVERED'].includes(o.status) && o.date >= daysAgo(15)).length)} />
        <Stat icon={CheckCircle2} tone="green" label="This FY" value={fmtINR(sum(fy, (o) => o.total))} sub={`${fy.length} orders`} />
      </Grid>

      {inProgress.length > 0 && (
        <>
          <SectionTitle>In progress</SectionTitle>
          <div className="grid md:grid-cols-2 gap-3 mb-5">
            {inProgress.map((o) => (
              <button key={o.id} type="button" onClick={() => setOpen(o.id)} className="text-left bg-white rounded-xl border border-slate-200 shadow-card p-4 hover:border-brand-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono font-semibold text-slate-900">{o.number}</div>
                    <div className="text-xs text-slate-500">{fmtDate(o.date)} · {o.lines.length} lines · {o.source === 'PORTAL' ? 'Portal' : 'Via Sales'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold tabular-nums">{fmtINR(o.total)}</div>
                    <StatusBadge status={o.status} label={SO_LABEL[o.status]} />
                  </div>
                </div>
                <div className="mt-3"><OrderStepper so={o} /></div>
                {(() => { const f = ful(o); return (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>Ordered <b className="tabular-nums">{fmtNum(f.ordered)}</b></span>
                    <span>Dispatched <b className="tabular-nums text-teal-700">{fmtNum(f.dispatched)}</b></span>
                    <span>Pending <b className="tabular-nums text-amber-700">{fmtNum(f.pending)}</b></span>
                    {f.pending > 0 && <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3" />{f.expected ? `Expected by ${fmtDate(f.expected)}` : 'Date to be confirmed'}</span>}
                  </div>
                ) })()}
                {o.status === 'CONFIRMED' && balanceDue(o) > 0 && <div className="mt-2 text-xs text-red-600 font-medium">Pay {fmtINR(balanceDue(o))} to release invoice{o.paymentAdvices?.length ? ' · payment advice shared, Accounts verifying' : ''}</div>}
                {o.status === 'DISPATCHED' && <div className="mt-2 text-xs text-teal-700 font-medium">LR {invoices.find((i) => i.id === o.invoiceId)?.lr?.number} · tap to download</div>}
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Order history</SectionTitle>
      <DataTable
        rows={orders}
        onRowClick={(o) => setOpen(o.id)}
        exportName={`Btali-Orders-${partner?.code}`}
        initialSort={{ key: 'date', dir: 'desc' }}
        filters={[{ key: 'status', label: 'statuses', options: [...new Set(orders.map((o) => o.status))].map((s) => ({ value: s, label: SO_LABEL[s] || s })) }]}
        columns={[
          { key: 'number', header: 'Order', render: (o) => <span className="font-mono font-medium">{o.number}</span> },
          { key: 'date', header: 'Date', render: (o) => fmtDate(o.date) },
          { key: 'lines', header: 'Items', value: (o) => o.lines.length, render: (o) => `${o.lines.length} lines · ${fmtNum(sum(o.lines, (l) => l.qty))} units`, align: 'right' },
          { key: 'total', header: 'Amount', align: 'right', render: (o) => <span className="tabular-nums font-medium">{fmtINR(o.total)}</span> },
          { key: 'ful', header: 'Dispatched / ordered', align: 'right', value: (o) => ful(o).dispatched, render: (o) => { const f = ful(o); return <span className={`tabular-nums ${f.pending && o.status !== 'CANCELLED' ? 'text-amber-700' : 'text-slate-600'}`}>{fmtNum(f.dispatched)} / {fmtNum(f.ordered)}</span> } },
          { key: 'invoice', header: 'Invoice', value: (o) => invoices.find((i) => i.id === o.invoiceId)?.number || '', render: (o) => <span className="font-mono text-xs">{invoices.find((i) => i.id === o.invoiceId)?.number || '—'}</span> },
          { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} label={SO_LABEL[o.status]} /> },
        ]}
      />

      <OrderDrawer so={sel} onClose={() => setOpen(null)} base={base} />
    </div>
  )
}

function OrderDrawer({ so, onClose, base }) {
  const nav = useNavigate()
  const partner = useStore((s) => s.partners.find((p) => p.id === so?.partnerId))
  const inv = useStore((s) => s.invoices.find((i) => i.id === so?.invoiceId))
  const transporter = useStore((s) => s.transporters.find((t) => t.id === (inv?.transporterId || so?.transporterId)))
  const receipts = useStore((s) => s.receipts)
  const addLinesToCart = useStore((s) => s.addLinesToCart)
  const portalCancelOrder = useStore((s) => s.portalCancelOrder)
  const [payOpen, setPayOpen] = useState(false)
  const [doc, setDoc] = useState(null)
  const [docInv, setDocInv] = useState(null)
  if (!so) return null
  const due = balanceDue(so)
  const myReceipts = receipts.filter((r) => r.soId === so.id)
  const reorder = () => {
    addLinesToCart(so.partnerId, so.lines.filter((l) => !l.free).map((l) => ({ productId: l.productId, qty: l.qty })))
    toast.success('Items added to cart', `${so.lines.filter((l) => !l.free).length} lines from ${so.number}`)
    nav(`${base}/cart`)
  }
  const cancel = async () => {
    const reason = await prompt({ title: `Cancel ${so.number}?`, label: 'Reason for cancellation', required: true, tone: 'danger', confirmText: 'Cancel order' })
    if (reason == null) return
    const r = portalCancelOrder(so.id, reason)
    if (r.ok) toast.success('Order cancelled', `${so.number} – Sales has been informed`)
    else toast.error('Cannot cancel', r.error)
  }
  return (
    <>
      <Drawer open onClose={onClose} title={so.number} subtitle={<span>{fmtDate(so.date)} · {so.source === 'PORTAL' ? 'Placed on portal' : 'Booked by Btali Sales'} · <StatusBadge status={so.status} label={SO_LABEL[so.status]} /></span>}
        footer={<>
          {so.status === 'PENDING_REVIEW' && <Button variant="danger" icon={XCircle} onClick={cancel}>Cancel order</Button>}
          <Button variant="secondary" icon={RotateCcw} onClick={reorder}>Reorder</Button>
          {so.status === 'CONFIRMED' && due > 0 && <Button icon={IndianRupee} onClick={() => setPayOpen(true)}>I have paid – share UTR</Button>}
        </>}>
        <div className="space-y-5">
          <OrderStepper so={so} />
          {so.status === 'PENDING_REVIEW' && <Alert tone="info" title="Under review by Btali Sales">You will receive an order confirmation with payment instructions once the order is reviewed.</Alert>}
          {so.status === 'CONFIRMED' && due > 0 && (
            <div className="space-y-2">
              <Alert tone="warn" title={`Advance payment of ${fmtINR(due)} pending`}>Remit the amount quoting {so.number}, then share the UTR so Accounts can release your invoice.</Alert>
              <BankBox amount={due} reference={so.number} />
            </div>
          )}
          {(so.paymentAdvices || []).length > 0 && (
            <div>
              <SectionTitle>Payment advices shared</SectionTitle>
              <div className="space-y-2">
                {so.paymentAdvices.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div><div className="font-mono">{a.mode} · {a.utr}</div><div className="text-[11px] text-slate-500">{fmtDate(a.date)} · shared {timeAgo(a.ts)}</div></div>
                    <div className="text-right"><div className="font-semibold tabular-nums">{fmtINR(a.amount)}</div>{so.paymentStatus === 'PAID' ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Accounts verifying</Badge>}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(inv || myReceipts.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {myReceipts.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="text-[11px] uppercase text-slate-400 font-semibold">Payment received</div><div className="font-semibold tabular-nums">{fmtINR(r.amount)}</div><div className="text-xs text-slate-500">{r.number} · {r.mode} {r.ref} · {fmtDate(r.date)}</div></div>
              ))}
              {inv && (
                <div className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="text-[11px] uppercase text-slate-400 font-semibold">Invoice & dispatch</div>
                  <div className="font-mono font-semibold">{inv.number}</div>
                  <div className="text-xs text-slate-500">{fmtDate(inv.date)} · {transporter?.name}{inv.lr ? ` · LR ${inv.lr.number}` : ' · awaiting LR'}</div>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="secondary" icon={FileText} onClick={() => setDoc('inv')}>Invoice</Button>
                    {inv.lr && <Button size="sm" variant="secondary" icon={Truck} onClick={() => (inv.lr.file?.url ? openAttachment(inv.lr.file) : setDoc('lr'))}>LR copy</Button>}
                  </div>
                </div>
              )}
            </div>
          )}
          <FulfilmentTable so={so} />
          <DispatchList so={so} onDoc={(i, kind) => { setDocInv(i); setDoc(kind) }} />
          <div>
            <SectionTitle>Order value</SectionTitle>
            <OrderLines lines={so.lines} subtotal={so.subtotal} gst={so.gst} total={so.total} />
          </div>
          {so.note && <div className="text-sm"><span className="text-slate-500">Note: </span>{so.note}</div>}
          <div>
            <SectionTitle>Activity</SectionTitle>
            <Timeline items={[...(so.timeline || [])].reverse()} />
          </div>
        </div>
      </Drawer>
      <PaymentAdviceModal open={payOpen} onClose={() => setPayOpen(false)} so={so} due={due} />
      {(() => { const d = docInv || inv; return (
        <Modal open={!!doc} onClose={() => { setDoc(null); setDocInv(null) }} title={doc === 'lr' ? `LR copy – ${d?.lr?.number}` : `Invoice ${d?.number}`} size="lg">
          {d && doc === 'inv' && <InvoiceDoc inv={d} partner={partner} transporter={transporter} />}
          {d && doc === 'lr' && <LRDoc inv={d} partner={partner} transporter={transporter} />}
        </Modal>
      ) })()}
    </>
  )
}

export function PaymentAdviceModal({ open, onClose, so, due }) {
  const submit = useStore((s) => s.submitPaymentAdvice)
  const [f, setF] = useState({ utr: '', amount: due, date: today(), mode: 'NEFT', remarks: '' })
  const [files, setFiles] = useState([])
  React.useEffect(() => { if (open) { setF({ utr: '', amount: due, date: today(), mode: 'NEFT', remarks: '' }); setFiles([]) } }, [open, due])
  const valid = f.utr.trim().length >= 6 && Number(f.amount) > 0
  const go = () => {
    const r = submit(so.id, { ...f, file: files[0] || null })
    if (!r.ok) return toast.error('Could not submit', r.error)
    toast.success('Payment advice shared', `Accounts will verify ${f.utr.toUpperCase()} and release your invoice`)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Share payment details" subtitle={`${so.number} · balance ${fmtINR(due)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid} icon={Receipt} onClick={go}>Submit to Accounts</Button></>}>
      <FormGrid>
        <Field label="Payment mode" required><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} options={['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque deposit']} /></Field>
        <Field label="UTR / reference no." required hint="At least 6 characters"><Input value={f.utr} onChange={(e) => setF({ ...f, utr: e.target.value })} placeholder="e.g. HDFCN26102712345" className="font-mono uppercase" /></Field>
        <Field label="Amount paid (₹)" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Payment date" required><Input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Remarks" className="md:col-span-2"><Textarea rows={2} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
      </FormGrid>
      <div className="mt-4">
        <SectionTitle>Payment proof (optional)</SectionTitle>
        {files.length ? <AttachmentList items={files} onRemove={() => setFiles([])} /> : <FileUpload compact multiple={false} onFiles={setFiles} label="Upload bank screenshot / counterfoil" />}
      </div>
      {Number(f.amount) > 0 && Number(f.amount) < due - 1 && <Alert tone="warn" className="mt-3">This is a part payment. The invoice is released once the full {fmtINR(due)} is received.</Alert>}
    </Modal>
  )
}

/** Ordered / dispatched / pending per line with expected fulfilment dates */
function FulfilmentTable({ so }) {
  const invoices = useStore((s) => s.invoices)
  const sst = useStockState()
  const f = fulfilment(so, invoices, sst)
  return (
    <div>
      <SectionTitle actions={f.pending > 0 && so.status !== 'CANCELLED' ? <span className="text-xs text-slate-500 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{f.expected ? `Expected fulfilment ${fmtDate(f.expected)}` : 'Fulfilment date to be confirmed'}</span> : f.pending === 0 ? <Badge tone="green" dot>Fully dispatched</Badge> : null}>Fulfilment status</SectionTitle>
      <div className="border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="text-left px-3 py-2 min-w-[200px]">Product</th><th className="text-right px-3 py-2">Ordered</th><th className="text-right px-3 py-2">Dispatched</th><th className="text-right px-3 py-2">Pending</th><th className="text-left px-3 py-2 min-w-[170px]">Expected</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {f.lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2"><ProductCell id={l.productId} sub={l.free ? 'Free (scheme)' : undefined} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.ordered)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-teal-700 font-medium">{fmtNum(l.dispatched)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${l.pending ? 'text-amber-700' : 'text-slate-400'}`}>{fmtNum(l.pending)}</td>
                <td className="px-3 py-2 text-xs">{!l.pending ? <span className="text-emerald-700">Dispatched</span> : so.status === 'CANCELLED' ? <span className="text-slate-400">Cancelled</span> : <><div className="font-medium text-slate-800">{l.expected ? fmtDate(l.expected) : 'To be confirmed'}</div><div className="text-slate-500">{l.note}</div></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Each dispatch (invoice + LR) against the order, with the products it carried and receipt acknowledgement */
function DispatchList({ so, onDoc }) {
  const allInvoices = useStore((s) => s.invoices)
  const transporters = useStore((s) => s.transporters)
  const [ack, setAck] = useState(null)
  const invoices = allInvoices.filter((i) => i.soId === so.id || i.id === so.invoiceId)
  if (!invoices.length) return null
  return (
    <div>
      <SectionTitle>Dispatches, invoices & LR</SectionTitle>
      <div className="space-y-3">
        {invoices.map((i) => {
          const tr = transporters.find((t) => t.id === i.transporterId)
          const received = i.inward?.acknowledged || i.history
          const canAck = (i.status === 'DISPATCHED' || i.lr) && !received
          return (
            <div key={i.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-mono font-semibold text-sm">{i.number}</div>
                  <div className="text-xs text-slate-500">Invoiced {fmtDate(i.date)} · {tr?.name || 'Transporter'}{i.lr ? ` · LR ${i.lr.number} dt. ${fmtDate(i.lr.date)}` : ' · awaiting dispatch'}</div>
                </div>
                {received ? <Badge tone="green" dot>Received{i.inward?.date ? ` ${fmtDate(i.inward.date)}` : ''}</Badge> : i.lr ? <Badge tone="teal" dot>In transit</Badge> : <Badge tone="violet" dot>Packing at warehouse</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {i.lines.map((l, k) => <ProductChip key={k} id={l.productId} qty={l.qty} />)}
              </div>
              {i.inward?.lines?.some((l) => l.received < l.expected || l.damaged) && <div className="mt-2 text-xs text-amber-700">Shortage / damage reported – tracked under Support.</div>}
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="secondary" icon={FileText} onClick={() => onDoc(i, 'inv')}>Invoice</Button>
                {i.lr && <Button size="sm" variant="secondary" icon={Truck} onClick={() => (i.lr.file?.url ? openAttachment(i.lr.file) : onDoc(i, 'lr'))}>LR copy</Button>}
                {canAck && <Button size="sm" icon={PackageCheck} onClick={() => setAck(i)}>Acknowledge receipt</Button>}
              </div>
            </div>
          )
        })}
      </div>
      {ack && <AckModal inv={ack} onClose={() => setAck(null)} />}
    </div>
  )
}
function ProductChip({ id, qty }) {
  const p = useStore((s) => s.products.find((x) => x.id === id))
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[11px] text-slate-700"><span className="font-mono">{p?.sku}</span> × {fmtNum(qty)}</span>
}

/** Dealer confirms what arrived against a dispatch; shortages / damage raise tickets automatically */
export function AckModal({ inv, onClose }) {
  const acknowledge = useStore((s) => s.acknowledgeInward)
  const products = useStore((s) => s.products)
  const [rows, setRows] = useState(() => inv.lines.map((l) => ({ productId: l.productId, expected: l.qty, received: l.qty, damaged: 0 })))
  const [remarks, setRemarks] = useState('')
  const [files, setFiles] = useState([])
  const setRow = (k, patch) => setRows((r) => r.map((x, j) => (j === k ? { ...x, ...patch } : x)))
  const issues = rows.filter((r) => r.received < r.expected || r.damaged > 0)
  const submit = () => {
    if (rows.some((r) => r.received < 0 || r.received > r.expected || r.damaged < 0 || r.damaged > r.received)) return toast.error('Check quantities', 'Received cannot exceed invoiced; damaged cannot exceed received')
    if (issues.length && !remarks.trim()) return toast.error('Add remarks', 'Describe the shortage or damage for Btali')
    const r = acknowledge(inv.id, { lines: rows, remarks, attachments: files })
    if (!r.ok) return toast.error('Could not acknowledge', r.error)
    toast.success('Receipt acknowledged', issues.length ? `${inv.number} · ${r.inward.ticketIds.length} ticket(s) raised for the discrepancy` : `${inv.number} · all items received in good condition`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Acknowledge receipt – ${inv.number}`} subtitle={inv.lr ? `LR ${inv.lr.number} · ${fmtDate(inv.lr.date)}` : undefined} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={PackageCheck} onClick={submit}>{issues.length ? 'Confirm & report issue' : 'Confirm all received'}</Button></>}>
      <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Invoiced</th><th className="text-right px-3 py-2 w-28">Received</th><th className="text-right px-3 py-2 w-28">Damaged</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, k) => (
              <tr key={k}>
                <td className="px-3 py-2 font-medium">{products.find((p) => p.id === r.productId)?.shortName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.expected}</td>
                <td className="px-3 py-2"><NumberInput min={0} max={r.expected} value={r.received} onChange={(v) => setRow(k, { received: Number(v) || 0 })} className="text-right" /></td>
                <td className="px-3 py-2"><NumberInput min={0} value={r.damaged} onChange={(v) => setRow(k, { damaged: Number(v) || 0 })} className="text-right" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {issues.length > 0 && <Alert tone="warn" className="mb-3" title="Discrepancy will be reported">Btali Dispatch and Service are notified and a support ticket is created with your remarks and photos.</Alert>}
      <Field label="Remarks" required={issues.length > 0}><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. 1 carton torn, unit body dented" /></Field>
      <div className="mt-3">{files.length ? <AttachmentList items={files} onRemove={(a) => setFiles((f) => f.filter((x) => x.id !== a.id))} /> : <FileUpload compact onFiles={setFiles} label="Upload photos of cartons / damage (optional)" />}</div>
    </Modal>
  )
}

