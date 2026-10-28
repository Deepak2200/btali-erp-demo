import React, { useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useParams, Link, useSearchParams } from 'react-router-dom'
import {
  Plus, CheckCircle2, XCircle, Mail, Copy, Printer, Ban, FileText, Truck, ArrowLeft, ListTodo, Receipt, Info, BellRing,
} from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Tabs, Button, StatusBadge, Badge, Stepper, Timeline, DescriptionList, Alert, Modal, EmptyState,
  confirm, prompt, toast, cx, KV,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PartnerCell, ProductCell, PrintArea, DocHeader, UserName } from '../../../components/business'
import { fmtINR, fmtCompact, fmtNum, fmtDate, sum, daysBetween, today, downloadText, round2 } from '../../../lib/format'
import { useScope, ScopeToggle, NewOrderModal, TaskModal, SALES_PEOPLE, REGIONS, LineStockCheck } from './_shared'

const TABS = [
  { key: 'PENDING_REVIEW', label: 'Pending review', match: (s) => s.status === 'PENDING_REVIEW' },
  { key: 'CONFIRMED', label: 'Awaiting payment', match: (s) => s.status === 'CONFIRMED' },
  { key: 'PAID', label: 'Paid', match: (s) => s.status === 'PAID' },
  { key: 'INVOICED', label: 'Invoiced', match: (s) => s.status === 'INVOICED' },
  { key: 'DISPATCHED', label: 'Dispatched', match: (s) => s.status === 'DISPATCHED' || s.status === 'DELIVERED' },
  { key: 'CANCELLED', label: 'Cancelled', match: (s) => s.status === 'CANCELLED' },
  { key: 'ALL', label: 'All', match: () => true },
]
const STEPS = [
  { key: 'PENDING_REVIEW', label: 'Review' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PAID', label: 'Paid' },
  { key: 'INVOICED', label: 'Invoiced' },
  { key: 'DISPATCHED', label: 'Dispatched' },
]

export default function Orders() {
  return (
    <Routes>
      <Route index element={<OrderList />} />
      <Route path=":id" element={<OrderDetail />} />
    </Routes>
  )
}

// ------------------------------------------------------------------ list
function OrderList() {
  const orders = useStore((s) => s.salesOrders)
  const users = useStore((s) => s.users)
  const { partner } = useLookup()
  const scope = useScope()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
    const [showNew, setShowNew] = useState(params.get('new') === '1')
  const scoped = useMemo(() => orders.filter((o) => scope.inScope(o.partnerId)), [orders, scope.mine]) // eslint-disable-line
  const counts = Object.fromEntries(TABS.map((t) => [t.key, scoped.filter(t.match).length]))
  const tab = params.get('tab') || (counts.PENDING_REVIEW ? 'PENDING_REVIEW' : 'CONFIRMED')
  const rows = useMemo(() => scoped.filter(TABS.find((t) => t.key === tab).match).map((o) => ({ ...o, partnerName: partner(o.partnerId)?.name, region: partner(o.partnerId)?.region })), [scoped, tab]) // eslint-disable-line
  const open = scoped.filter((o) => ['PENDING_REVIEW', 'CONFIRMED', 'PAID'].includes(o.status))
  const monthKey = today().slice(0, 7)
  const mtd = scoped.filter((o) => o.date.startsWith(monthKey) && o.status !== 'CANCELLED')

  return (
    <div>
      <PageHeader title="Sales Orders" subtitle="Sales-created orders are confirmed instantly; portal orders are reviewed here. Advance payment → invoice → LR."
        actions={<><ScopeToggle scope={scope} /><Button icon={Plus} onClick={() => setShowNew(true)}>New sales order</Button></>} />
      <Grid cols={4} className="mb-5">
        <Stat label="Pending review" value={counts.PENDING_REVIEW} sub="Dealer portal orders" icon={Info} tone="amber" onClick={() => setParams({ tab: 'PENDING_REVIEW' })} />
        <Stat label="Awaiting advance" value={fmtCompact(sum(scoped.filter((o) => o.status === 'CONFIRMED'), (o) => o.total - (o.paidAmount || 0)))} sub={`${counts.CONFIRMED} orders`} icon={Receipt} tone="red" onClick={() => setParams({ tab: 'CONFIRMED' })} />
        <Stat label="Paid – ready to invoice" value={fmtCompact(sum(scoped.filter((o) => o.status === 'PAID'), (o) => o.total))} sub={`${counts.PAID} orders (book stock)`} icon={CheckCircle2} tone="green" onClick={() => setParams({ tab: 'PAID' })} />
        <Stat label="Booked this month" value={fmtCompact(sum(mtd, (o) => o.total))} sub={`${mtd.length} orders · ${open.length} open`} icon={FileText} tone="ink" />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={(k) => setParams({ tab: k })} tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))} />
      <DataTable
        rows={rows}
        onRowClick={(r) => navigate(`/erp/sales/orders/${r.id}`)}
        exportName={`sales-orders-${tab.toLowerCase()}`}
        initialSort={{ key: 'date', dir: 'desc' }}
        searchPlaceholder="Search order no. or dealer…"
        filters={[
          { key: 'source', label: 'sources', options: [{ value: 'SALES', label: 'Sales team' }, { value: 'PORTAL', label: 'Dealer portal' }] },
          { key: 'region', label: 'regions', options: [...REGIONS, 'Export'] },
          ...(!scope.isExec || !scope.mine ? [{ key: 'salespersonId', label: 'salespeople', options: [...SALES_PEOPLE, 'u4'].map((id) => ({ value: id, label: users.find((u) => u.id === id)?.name })) }] : []),
          { key: 'paymentStatus', label: 'payment', options: ['UNPAID', 'PARTIAL', 'PAID'] },
        ]}
        columns={[
          { key: 'number', header: 'Order', render: (r) => <span className="font-mono text-xs font-semibold text-ink-800">{r.number}</span> },
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'partnerName', header: 'Dealer', render: (r) => <PartnerCell id={r.partnerId} /> },
          { key: 'source', header: 'Source', render: (r) => <Badge tone={r.source === 'PORTAL' ? 'blue' : 'gray'}>{r.source === 'PORTAL' ? 'Portal' : 'Sales'}</Badge> },
          { key: 'salespersonId', header: 'Owner', value: (r) => users.find((u) => u.id === r.salespersonId)?.name, render: (r) => <span className="text-xs"><UserName id={r.salespersonId} /></span> },
          { key: 'lines', header: 'Items', align: 'right', value: (r) => r.lines.filter((l) => !l.free).length },
          { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="font-semibold">{fmtINR(r.total)}</span> },
          { key: 'paymentStatus', header: 'Payment', render: (r) => <StatusBadge status={r.paymentStatus} /> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={r.status === 'CONFIRMED' ? 'Awaiting payment' : undefined} /> },
        ]}
        empty={<EmptyState title="No orders in this stage" message="Orders move here automatically as payment, invoicing and dispatch happen." />}
      />
      {showNew && <NewOrderModal open onClose={() => { setShowNew(false); if (params.get('new')) setParams({ tab }) }} scope={scope} />}
    </div>
  )
}

// ------------------------------------------------------------------ document helpers
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
export const downloadDocHtml = (fileName, title, number, meta, lines, totals, company, products) => {
  const rows = lines.map((l, i) => {
    const p = products.find((x) => x.id === l.productId)
    return `<tr><td>${i + 1}</td><td>${esc(p?.name)}<br><small>${esc(p?.sku)} · HSN ${esc(p?.hsn)}</small></td><td class=r>${l.qty}</td><td class=r>${fmtINR(l.price, true)}</td><td class=r>${fmtINR(l.amount, true)}</td></tr>`
  }).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} ${esc(number)}</title><style>body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;padding:32px;max-width:860px;margin:auto}h1{margin:0;font-style:italic}h1 span{color:#f2541f}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left}.r{text-align:right}.meta{display:flex;justify-content:space-between;margin-top:12px;font-size:13px}small{color:#64748b}</style></head><body>
<div class="meta"><div><h1>B<span>TALI</span></h1><small>${esc(company.legalName)}<br>${esc(company.address)}<br>GSTIN ${esc(company.gstin)}</small></div><div class=r><h2 style="margin:0">${esc(title)}</h2><div>${esc(number)}</div>${meta.map(([k, v]) => `<div><small>${esc(k)}:</small> ${esc(v)}</div>`).join('')}</div></div>
<table><thead><tr><th>#</th><th>Item</th><th class=r>Qty</th><th class=r>Rate</th><th class=r>Amount</th></tr></thead><tbody>${rows}</tbody></table>
<table style="width:320px;margin-left:auto">${totals.map(([k, v]) => `<tr><td>${esc(k)}</td><td class=r><b>${esc(v)}</b></td></tr>`).join('')}</table>
<p style="margin-top:40px;font-size:12px;color:#64748b">This is a computer-generated document from Btali ERP.</p></body></html>`
  downloadText(fileName, html, 'text/html')
}

function DiscountCell({ line: l0, mrp }) {
  const line = { ...l0, mrp: l0.mrp || mrp }
  if (!line.free && !line.discountPct && line.mrp && line.price < line.mrp) line.discountPct = round2((1 - line.price / line.mrp) * 100)
  const d = line.discounts?.length ? line.discounts : line.discountPct && !line.free ? [{ label: 'Price list + dealer terms', pct: line.discountPct }] : []
  return (
    <span className="relative group inline-flex items-center gap-1 cursor-help">
      {line.free ? 'Free' : line.discountPct ? `${line.discountPct}%` : '—'}
      {d.length > 0 && <Info className="w-3.5 h-3.5 text-slate-400" />}
      {d.length > 0 && (
        <span className="hidden group-hover:block absolute right-0 top-5 z-30 w-64 bg-ink-900 text-white text-xs rounded-lg shadow-xl p-2.5 text-left">
          <span className="block font-semibold mb-1">Discount breakdown</span>
          {d.map((x, i) => <span key={i} className="flex justify-between gap-2"><span className="text-white/80">{x.label}</span><span className="tabular-nums">{x.pct ? `${x.pct}%` : ''}</span></span>)}
          {line.mrp ? <span className="flex justify-between gap-2 mt-1 pt-1 border-t border-white/20"><span>MRP {fmtINR(line.mrp)} → net</span><span>{fmtINR(line.price, true)}</span></span> : null}
        </span>
      )}
    </span>
  )
}

// ------------------------------------------------------------------ detail
function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useStore()
  const so = state.salesOrders.find((x) => x.id === id)
  const { partner, transporter } = useLookup()
  const approvePortalOrder = useStore((s) => s.approvePortalOrder)
  const cancelSalesOrder = useStore((s) => s.cancelSalesOrder)
  const sendOrderConfirmation = useStore((s) => s.sendOrderConfirmation)
  const sendEmail = useStore((s) => s.sendEmail)
  const updateItem = useStore((s) => s.updateItem)
  const [dup, setDup] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  if (!so) return <Card><EmptyState title="Order not found" action={<Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/erp/sales/orders')}>Back to orders</Button>} /></Card>
  const p = partner(so.partnerId)
  const inv = state.invoices.find((i) => i.id === so.invoiceId || i.soId === so.id)
  const receipts = state.receipts.filter((r) => r.soId === so.id)
  const quotation = (state.quotations || []).find((q) => q.id === so.quotationId)
  const schemes = (so.appliedSchemes || []).map((sid) => state.schemes.find((s) => s.id === sid)).filter(Boolean)
  const tasks = (state.tasks || []).filter((t) => t.soId === so.id)
  const current = so.status === 'DELIVERED' ? 'DISPATCHED' : so.status
  const stepCurrent = so.source !== 'PORTAL' && current === 'CONFIRMED' ? 'CONFIRMED' : current
  const steps = so.source === 'PORTAL' ? STEPS : STEPS.slice(1)
  const balance = round2(so.total - (so.paidAmount || 0))
  const company = state.settings.company
  const tr = transporter(inv?.transporterId || so.transporterId)
  const timeline = (so.timeline?.length ? so.timeline : [
    { ts: `${so.date}T10:00:00Z`, text: 'Order created & confirmed' },
    so.paymentStatus === 'PAID' && { ts: `${so.date}T14:00:00Z`, text: `Advance ${fmtINR(so.total)} received` },
    inv && { ts: `${inv.date}T11:00:00Z`, text: `Invoice ${inv.number} generated & emailed` },
    inv?.lr && { ts: `${inv.lr.date}T17:00:00Z`, text: `Dispatched – LR ${inv.lr.number}` },
  ].filter(Boolean)).slice().reverse()

  const approve = async () => {
    const remark = await prompt({ title: `Confirm ${so.number}`, label: 'Remark (optional)', confirmText: 'Confirm order' })
    if (remark === null) return
    approvePortalOrder(so.id, true, remark)
    toast.success('Order confirmed', `Confirmation emailed to ${p.email}`)
  }
  const reject = async () => {
    const remark = await prompt({ title: `Reject ${so.number}`, label: 'Reason (shared with dealer)', required: true, tone: 'danger', confirmText: 'Reject order' })
    if (!remark) return
    approvePortalOrder(so.id, false, remark)
    toast.success('Order rejected', 'Dealer notified on the portal')
  }
  const cancel = async () => {
    const reason = await prompt({ title: `Cancel ${so.number}`, label: 'Cancellation reason', required: true, tone: 'danger', confirmText: 'Cancel order' })
    if (!reason) return
    cancelSalesOrder(so.id, reason)
    sendEmail({ to: p.email, subject: `Order ${so.number} cancelled – Btali International`, body: `Dear ${p.contact},\n\nYour order ${so.number} has been cancelled.\nReason: ${reason}\n\nRegards,\nBtali Sales`, ref: so.number })
    toast.success('Order cancelled', 'Dealer informed by email')
  }
  const resend = async () => {
    if (!(await confirm({ title: 'Resend confirmation?', message: `Order confirmation for ${so.number} will be emailed again to ${p.email}.`, confirmText: 'Send email' }))) return
    sendOrderConfirmation(so.id)
    updateItem('salesOrders', so.id, (x) => ({ ...x, timeline: [...(x.timeline || []), { ts: new Date().toISOString(), text: `Confirmation re-sent to ${p.email}` }] }))
    toast.success('Confirmation sent', p.email)
  }
  const remind = () => {
    sendEmail({ to: p.email, subject: `Advance pending for order ${so.number}`, body: `Dear ${p.contact},\n\nA balance of ${fmtINR(balance)} is pending against order ${so.number}. Kindly remit the advance to HDFC Bank current account so we can invoice and dispatch.\n\nRegards,\nBtali Sales`, ref: so.number, kind: 'PAYMENT_REMINDER' })
    updateItem('salesOrders', so.id, (x) => ({ ...x, timeline: [...(x.timeline || []), { ts: new Date().toISOString(), text: `Payment reminder emailed (${fmtINR(balance)})` }] }))
    toast.success('Payment reminder emailed', p.email)
  }
  const dlInvoice = () => downloadDocHtml(`${inv.number.replace(/\//g, '-')}.html`, 'Tax Invoice', inv.number, [['Date', fmtDate(inv.date)], ['Bill to', p.name], ['GSTIN', p.gstin || '—'], ['IRN', inv.irn], ['E-way bill', inv.ewayBill]], inv.lines, [['Taxable value', fmtINR(inv.subtotal, true)], ['GST @18%', fmtINR(inv.gst, true)], ['Invoice total', fmtINR(inv.total, true)]], company, state.products)
  const dlLR = () => {
    if (inv.lr?.file?.url) { window.open(inv.lr.file.url, '_blank'); return }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>LR ${esc(inv.lr.number)}</title><style>body{font-family:Segoe UI,Arial;padding:32px;max-width:700px;margin:auto}td{padding:6px;border-bottom:1px solid #e2e8f0}</style></head><body><h2>Lorry Receipt – ${esc(inv.lr.number)}</h2><table>${[['Transporter', tr?.name], ['Vehicle', inv.lr.vehicleNo || inv.vehicleNo || tr?.vehicleNo], ['LR date', fmtDate(inv.lr.date)], ['Consignor', company.legalName + ', Btali 3PL Bhiwandi'], ['Consignee', `${p.name}, ${p.address || p.city}`], ['Invoice', inv.number], ['Packages', `${sum(inv.lines, (l) => l.qty)} units`], ['Invoice value', fmtINR(inv.total)]].map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table></body></html>`
    downloadText(`LR-${inv.lr.number}.html`, html, 'text/html')
  }

  return (
    <div>
      <PageHeader
        breadcrumb={<Link to="/erp/sales/orders" className="hover:underline">Sales Orders</Link>}
        title={<span className="flex items-center gap-3 flex-wrap">{so.number}<StatusBadge status={so.status} label={so.status === 'CONFIRMED' ? 'Awaiting payment' : undefined} /></span>}
        subtitle={<>{fmtDate(so.date)} · {so.source === 'PORTAL' ? 'Placed on Dealer Portal' : 'Created by Sales'} · <Link className="text-brand-600 hover:underline" to={`/erp/sales/dealers/${p?.id}`}>{p?.name}</Link></>}
        actions={<>
          {so.status === 'PENDING_REVIEW' && <><Button variant="success" icon={CheckCircle2} onClick={approve}>Confirm order</Button><Button variant="danger" icon={XCircle} onClick={reject}>Reject</Button></>}
          {so.status === 'CONFIRMED' && <Button variant="secondary" icon={BellRing} onClick={remind}>Payment reminder</Button>}
          {['CONFIRMED', 'PAID'].includes(so.status) && <Button variant="secondary" icon={Mail} onClick={resend}>Resend confirmation</Button>}
          <Button variant="secondary" icon={Printer} onClick={() => setPrintOpen(true)}>Print</Button>
          <Button variant="secondary" icon={Copy} onClick={() => setDup(true)}>Duplicate</Button>
          <Button variant="secondary" icon={ListTodo} onClick={() => setTaskOpen(true)}>Task</Button>
          {['PENDING_REVIEW', 'CONFIRMED', 'PAID'].includes(so.status) && <Button variant="ghost" icon={Ban} className="text-red-600" onClick={cancel}>Cancel</Button>}
        </>}
      />
      {so.status === 'CANCELLED' ? (
        <Alert tone="error" className="mb-4" title="Order cancelled">{[...(so.timeline || [])].reverse().find((t) => /Cancelled|Rejected/.test(t.text))?.text}</Alert>
      ) : (
        <Card className="mb-4"><Stepper steps={steps} current={stepCurrent} /></Card>
      )}
      {so.status === 'PAID' && so.lines.some((l) => (state.stock['WH-BTALI']?.[l.productId] || 0) < l.qty) && (
        <Alert tone="warn" className="mb-4" title="Stock short for invoicing">Dispatch cannot invoice until stock arrives. Check incoming ETA below and update the dealer.</Alert>
      )}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Order lines" subtitle="Hover a discount for the full breakdown" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="text-left px-4 py-2">Product</th><th className="text-right px-3">Qty</th><th className="text-right px-3">MRP</th><th className="text-right px-3">Discount</th><th className="text-right px-3">Net rate</th><th className="text-right px-4">Amount</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {so.lines.map((l, i) => (
                    <tr key={i} className={l.free ? 'bg-emerald-50/50' : ''}>
                      <td className="px-4 py-2"><ProductCell id={l.productId} sub={l.free ? 'FREE (scheme)' : undefined} /></td>
                      <td className="px-3 text-right tabular-nums">{fmtNum(l.qty)}</td>
                      <td className="px-3 text-right tabular-nums text-slate-500">{l.mrp ? fmtINR(l.mrp) : fmtINR(state.products.find((x) => x.id === l.productId)?.mrp)}</td>
                      <td className="px-3 text-right text-slate-600"><DiscountCell line={l} mrp={state.products.find((x) => x.id === l.productId)?.mrp} /></td>
                      <td className="px-3 text-right tabular-nums">{fmtINR(l.price, true)}</td>
                      <td className="px-4 text-right tabular-nums font-medium">{fmtINR(l.amount, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-sm space-y-1">
              <div className="flex justify-end gap-6"><span className="text-slate-500">Taxable value</span><span className="tabular-nums w-32 text-right">{fmtINR(so.subtotal, true)}</span></div>
              <div className="flex justify-end gap-6"><span className="text-slate-500">GST @18%</span><span className="tabular-nums w-32 text-right">{fmtINR(so.gst, true)}</span></div>
              <div className="flex justify-end gap-6 font-bold"><span>Order total</span><span className="tabular-nums w-32 text-right">{fmtINR(so.total, true)}</span></div>
            </div>
          </Card>
          {schemes.length > 0 && (
            <Card title="Schemes applied">
              <div className="space-y-2">{schemes.map((s) => <div key={s.id} className="flex items-start gap-3 text-sm"><Badge tone="violet">{s.code}</Badge><div><div className="font-medium text-slate-800">{s.name}</div><div className="text-xs text-slate-500">{s.description}</div></div></div>)}</div>
            </Card>
          )}
          {['PENDING_REVIEW', 'CONFIRMED', 'PAID'].includes(so.status) && <LineStockCheck lines={so.lines.filter((l) => !l.free)} />}
          <Card title="Invoice & LR">
            {inv ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 rounded-lg p-3">
                  <div><div className="font-mono text-sm font-semibold">{inv.number}</div><div className="text-xs text-slate-500">{fmtDate(inv.date)} · {fmtINR(inv.total)} · IRN {inv.irn}</div></div>
                  <div className="flex gap-2 items-center"><StatusBadge status={inv.status} /><Button size="sm" variant="secondary" icon={FileText} onClick={dlInvoice}>Invoice</Button></div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 rounded-lg p-3">
                  {inv.lr ? <><div><div className="text-sm font-semibold">LR {inv.lr.number}</div><div className="text-xs text-slate-500">{tr?.name} · {fmtDate(inv.lr.date)} · emailed to dealer</div></div><Button size="sm" variant="secondary" icon={Truck} onClick={dlLR}>LR copy</Button></>
                    : <div className="text-sm text-slate-500">LR not uploaded yet – Dispatch / Btali will upload after loading ({tr?.name || 'transporter'}).</div>}
                </div>
              </div>
            ) : <div className="text-sm text-slate-500">{so.paymentStatus === 'PAID' ? 'Fully paid – Dispatch will generate the invoice from the ready-to-invoice queue.' : 'Invoice is generated automatically once Accounts marks the advance as received.'}</div>}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Payment">
            <KV label="Order total" value={fmtINR(so.total)} />
            <KV label="Received" value={<span className="text-emerald-700">{fmtINR(so.paidAmount || 0)}</span>} />
            <KV label="Balance" value={<span className={balance > 1 ? 'text-red-600' : ''}>{fmtINR(Math.max(0, balance))}</span>} />
            <div className="mt-1 mb-3"><StatusBadge status={so.paymentStatus} /></div>
            {receipts.length ? <ul className="divide-y divide-slate-100 text-sm border-t border-slate-100">{receipts.map((r) => <li key={r.id} className="py-2 flex justify-between gap-2"><span><span className="font-mono text-xs">{r.number}</span><br /><span className="text-xs text-slate-500">{fmtDate(r.date)} · {r.mode} · {r.ref}</span></span><span className="tabular-nums font-medium">{fmtINR(r.amount)}</span></li>)}</ul>
              : <div className="text-xs text-slate-500">No receipts yet. Advance payment model – invoicing unlocks on full payment.</div>}
          </Card>
          <Card title="Details">
            <DescriptionList cols={1} items={[
              ['Dealer', <Link key="d" className="text-brand-600 hover:underline" to={`/erp/sales/dealers/${p?.id}`}>{p?.name}</Link>],
              ['Salesperson', <UserName key="u" id={so.salespersonId} />],
              ['Transporter', tr?.name || '—'],
              ['Warehouse', so.warehouseId === 'WH-GUJ' ? 'Gujarat facility' : 'Btali 3PL – Bhiwandi'],
              quotation && ['From quotation', <Link key="q" className="text-brand-600 hover:underline" to={`/erp/sales/quotations?open=${quotation.id}`}>{quotation.number}</Link>],
              so.note && ['Note', so.note],
              ['Order age', `${daysBetween(so.date, today())} days`],
            ]} />
          </Card>
          {tasks.length > 0 && (
            <Card title="Linked tasks">
              <ul className="space-y-2 text-sm">{tasks.map((t) => <li key={t.id} className="flex justify-between gap-2"><span className={cx(t.status === 'DONE' && 'line-through text-slate-400')}>{t.title}</span><StatusBadge status={t.status} /></li>)}</ul>
            </Card>
          )}
          <Card title="Timeline"><Timeline items={timeline} /></Card>
        </div>
      </div>
      {dup && <NewOrderModal open onClose={() => setDup(false)} initial={{ title: `Duplicate of ${so.number}`, partnerId: so.partnerId, lines: so.lines.filter((l) => !l.free).map((l) => ({ productId: l.productId, qty: l.qty })), note: so.note }} />}
      {taskOpen && <TaskModal open onClose={() => setTaskOpen(false)} initial={{ partnerId: so.partnerId, soId: so.id, type: so.status === 'CONFIRMED' ? 'COLLECTION' : 'FOLLOW_UP', title: `${so.status === 'CONFIRMED' ? 'Collect advance' : 'Follow up'} – ${so.number}` }} />}
      <Modal open={printOpen} onClose={() => setPrintOpen(false)} size="lg" title={`Print ${so.number}`}>
        <PrintArea title={so.number}>
          <DocHeader title="Sales Order" number={so.number} date={so.date} right={<div className="text-xs text-slate-500 mt-1">Payment: 100% advance</div>} />
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div><div className="text-[11px] uppercase text-slate-400">Bill to</div><div className="font-semibold">{p?.name}</div><div className="text-slate-600">{p?.address}<br />{p?.city}, {p?.state}<br />GSTIN {p?.gstin || '—'}</div></div>
            <div className="text-right"><div className="text-[11px] uppercase text-slate-400">Dispatch via</div><div>{tr?.name || '—'}</div><div className="text-slate-600">Salesperson: <UserName id={so.salespersonId} /></div></div>
          </div>
          <table className="w-full text-sm border-t border-slate-200">
            <thead className="text-[11px] uppercase text-slate-500"><tr><th className="text-left py-2">Item</th><th className="text-right">Qty</th><th className="text-right">MRP</th><th className="text-right">Disc.</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{so.lines.map((l, i) => { const pr = state.products.find((x) => x.id === l.productId); return <tr key={i} className="border-t border-slate-100"><td className="py-1.5">{pr?.name}{l.free ? ' (FREE)' : ''}<div className="text-[11px] text-slate-400">{pr?.sku} · HSN {pr?.hsn}</div></td><td className="text-right">{l.qty}</td><td className="text-right">{fmtINR(l.mrp || pr?.mrp)}</td><td className="text-right">{l.discountPct ? `${l.discountPct}%` : '—'}</td><td className="text-right">{fmtINR(l.price, true)}</td><td className="text-right">{fmtINR(l.amount, true)}</td></tr> })}</tbody>
          </table>
          <div className="mt-3 ml-auto w-64 text-sm space-y-1"><div className="flex justify-between"><span>Taxable</span><span>{fmtINR(so.subtotal, true)}</span></div><div className="flex justify-between"><span>GST 18%</span><span>{fmtINR(so.gst, true)}</span></div><div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{fmtINR(so.total, true)}</span></div></div>
          {schemes.length > 0 && <div className="text-xs text-slate-500 mt-3">Schemes applied: {schemes.map((s) => s.code).join(', ')}</div>}
          <div className="text-xs text-slate-500 mt-6">Bank: HDFC Bank current account · Please quote {so.number} in the payment reference.</div>
        </PrintArea>
      </Modal>
    </div>
  )
}
