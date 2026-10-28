import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Truck, RotateCcw, XCircle, IndianRupee, Receipt, ShoppingCart, Clock, CheckCircle2 } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, StatusBadge, Drawer, Modal, Field, Input, NumberInput, Select, Textarea, FormGrid, FileUpload, AttachmentList, Timeline, Alert, Grid, Stat, SectionTitle, toast, prompt, openAttachment } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { OrderLines } from '../../components/business'
import { fmtINR, fmtDate, fmtNum, today, sum, daysAgo, timeAgo } from '../../lib/format'
import { usePortal, OrderStepper, SO_LABEL, balanceDue, BankBox, InvoiceDoc, LRDoc } from './_portal'

const OPEN = ['PENDING_REVIEW', 'CONFIRMED', 'PAID', 'INVOICED']

export default function Orders() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const { partnerId, partner, base } = usePortal()
  const allSOs = useStore((s) => s.salesOrders)
  const invoices = useStore((s) => s.invoices)
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
          <div>
            <SectionTitle>Items</SectionTitle>
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
      <Modal open={!!doc} onClose={() => setDoc(null)} title={doc === 'lr' ? `LR copy – ${inv?.lr?.number}` : `Invoice ${inv?.number}`} size="lg">
        {inv && doc === 'inv' && <InvoiceDoc inv={inv} partner={partner} transporter={transporter} />}
        {inv && doc === 'lr' && <LRDoc inv={inv} partner={partner} transporter={transporter} />}
      </Modal>
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

