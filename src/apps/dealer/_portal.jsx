// Shared helpers for the Dealer Portal + Franchise Portal pages (several dealer/* pages are reused by /franchise).
import React, { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore, useUser } from '../../store'
import { Badge, Stepper, Card, cx } from '../../components/ui'
import { PrintArea, DocHeader, OrderLines } from '../../components/business'
import { fmtINR, fmtDate, fmtNum, downloadText, round2 } from '../../lib/format'
import { onHand, bookStock, incoming } from '../../lib/stock'

/** Current partner context + app base ('/dealer' | '/franchise') */
export function usePortal() {
  const user = useUser()
  const loc = useLocation()
  const partnerId = user?.partnerId
  const partner = useStore((s) => s.partners.find((p) => p.id === partnerId))
  const base = loc.pathname.startsWith('/franchise') ? '/franchise' : '/dealer'
  return { user, partnerId, partner, base, isFranchise: base === '/franchise' || partner?.type === 'FRANCHISE' }
}

/** Minimal state slice the pricing engine needs (keeps re-renders scoped) */
export function usePricingState() {
  const products = useStore((s) => s.products)
  const partners = useStore((s) => s.partners)
  const priceLists = useStore((s) => s.priceLists)
  const schemes = useStore((s) => s.schemes)
  const settings = useStore((s) => s.settings)
  return useMemo(() => ({ products, partners, priceLists, schemes, settings }), [products, partners, priceLists, schemes, settings])
}

export function useStockState() {
  const stock = useStore((s) => s.stock)
  const salesOrders = useStore((s) => s.salesOrders)
  const purchaseOrders = useStore((s) => s.purchaseOrders)
  const shipments = useStore((s) => s.shipments)
  return useMemo(() => ({ stock, salesOrders, purchaseOrders, shipments }), [stock, salesOrders, purchaseOrders, shipments])
}

/** Availability at Btali warehouse as shown to partners */
export function availability(st, product) {
  const free = Math.max(0, onHand(st, product.id) - bookStock(st, product.id))
  const limitAt = Math.max(5, Math.round(product.reorderLevel / 3))
  if (free >= limitAt) return { key: 'IN', label: 'In stock', tone: 'green', free }
  if (free > 0) return { key: 'LIMITED', label: `Limited – ${fmtNum(free)} left`, tone: 'amber', free }
  const inc = incoming(st, product.id).filter((x) => x.eta).sort((a, b) => a.eta.localeCompare(b.eta))[0]
  if (inc) return { key: 'ARRIVING', label: `Arriving by ${fmtDate(inc.eta)}`, tone: 'blue', free: 0, eta: inc.eta }
  return { key: 'OUT', label: 'On order', tone: 'gray', free: 0 }
}
export const AvailabilityBadge = ({ a }) => <Badge tone={a.tone} dot>{a.label}</Badge>

/** Btali collection bank account for advance remittance */
export function useBank() {
  const banks = useStore((s) => s.bankAccounts)
  const company = useStore((s) => s.settings.company)
  const b = (banks || []).find((x) => x.id === 'bk1') || (banks || [])[0] || {}
  return {
    name: company.legalName,
    bank: b.bank || b.bankName || 'HDFC Bank Ltd.',
    branch: b.branch || 'Turbhe MIDC, Navi Mumbai',
    accountNo: b.accountNo || b.accountNumber || b.number || '50200048817301',
    ifsc: b.ifsc || b.IFSC || 'HDFC0001247',
    upi: b.upi || 'btali@hdfcbank',
    id: b.id || 'bk1',
  }
}
export function BankBox({ amount, reference, className }) {
  const b = useBank()
  return (
    <div className={cx('rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-sm', className)}>
      <div className="text-[11px] uppercase tracking-wide font-semibold text-ink-700 mb-2">Remit advance to</div>
      <dl className="grid grid-cols-[108px_minmax(0,1fr)] gap-y-1 [&_dd]:break-words">
        <dt className="text-slate-500">Account name</dt><dd className="font-medium text-slate-800">{b.name}</dd>
        <dt className="text-slate-500">Bank</dt><dd className="text-slate-800">{b.bank}, {b.branch}</dd>
        <dt className="text-slate-500">A/c number</dt><dd className="font-mono text-slate-900">{b.accountNo}</dd>
        <dt className="text-slate-500">IFSC</dt><dd className="font-mono text-slate-900">{b.ifsc}</dd>
        <dt className="text-slate-500">UPI</dt><dd className="font-mono text-slate-900">{b.upi}</dd>
        {amount != null && <><dt className="text-slate-500">Amount</dt><dd className="font-bold text-ink-900">{fmtINR(amount)}</dd></>}
        {reference && <><dt className="text-slate-500">Reference</dt><dd className="font-mono text-slate-900">{reference}</dd></>}
      </dl>
    </div>
  )
}

// ------------------------------------------------------------------ order status
export const SO_STEPS = [
  { key: 'PENDING_REVIEW', label: 'Under review' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PAID', label: 'Paid' },
  { key: 'INVOICED', label: 'Invoiced' },
  { key: 'DISPATCHED', label: 'Dispatched' },
  { key: 'DELIVERED', label: 'Delivered' },
]
export const SO_LABEL = { PENDING_REVIEW: 'Under review', CONFIRMED: 'Awaiting payment', PAID: 'Paid – invoicing', INVOICED: 'Invoiced', DISPATCHED: 'Dispatched', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' }
export function OrderStepper({ so }) {
  if (so.status === 'CANCELLED') return <Badge tone="red" dot>Cancelled</Badge>
  return <Stepper steps={SO_STEPS} current={so.status} />
}
export const balanceDue = (so) => round2(Math.max(0, (so.total || 0) - (so.paidAmount || 0)))

// ------------------------------------------------------------------ documents
export function InvoiceDoc({ inv, partner, transporter }) {
  return (
    <PrintArea title={`Invoice ${inv.number}`}>
      <DocHeader title={inv.type === 'FOC' ? 'Free of cost invoice' : 'Tax invoice'} number={inv.number} date={inv.date}
        right={<div className="text-[11px] text-slate-500 mt-1">IRN {inv.irn || '—'}<br />E-way bill {inv.ewayBill || '—'}</div>} />
      <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Billed to</div>
          <div className="font-semibold text-slate-900">{partner?.name}</div>
          <div className="text-slate-600 text-xs leading-relaxed">{partner?.address}<br />{partner?.city}, {partner?.state}<br />GSTIN {partner?.gstin || '—'}</div>
        </div>
        <div className="sm:text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Dispatch</div>
          <div className="text-slate-700 text-xs leading-relaxed">Transporter: {transporter?.name || '—'}<br />Vehicle: {inv.vehicleNo || '—'}<br />LR: {inv.lr?.number || 'Awaiting dispatch'}{inv.lr?.date ? ` dt. ${fmtDate(inv.lr.date)}` : ''}</div>
        </div>
      </div>
      <OrderLines lines={inv.lines} subtotal={inv.subtotal} gst={inv.gst} total={inv.total} />
      <div className="text-[11px] text-slate-500 mt-4">Amount in words: Indian Rupees {fmtINR(inv.total).replace('₹', '')} only. Goods once sold are covered by Btali warranty terms. Subject to Navi Mumbai jurisdiction.</div>
      <div className="flex justify-end mt-8 text-xs text-slate-600"><div className="text-center"><div className="h-8" />For Btali International Pvt. Ltd.<br />Authorised signatory</div></div>
    </PrintArea>
  )
}
export function LRDoc({ inv, partner, transporter }) {
  const company = useStore((s) => s.settings.company)
  return (
    <PrintArea title={`LR ${inv.lr?.number}`}>
      <div className="flex justify-between items-start border-b border-slate-200 pb-3 mb-3">
        <div>
          <div className="text-lg font-black text-ink-900 uppercase">{transporter?.name || 'Transporter'}</div>
          <div className="text-xs text-slate-500">Consignment note / Lorry receipt</div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-lg">{inv.lr?.number}</div>
          <div className="text-xs text-slate-500">Date {fmtDate(inv.lr?.date)}</div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Consignor</div><div className="font-medium">{company.legalName}</div><div className="text-xs text-slate-600">Btali 3PL – Bhiwandi</div></div>
        <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Consignee</div><div className="font-medium">{partner?.name}</div><div className="text-xs text-slate-600">{partner?.address}, {partner?.city}</div></div>
        <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Invoice</div><div className="font-mono">{inv.number}</div><div className="text-xs text-slate-600">Value {fmtINR(inv.total)}</div></div>
        <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Vehicle</div><div className="font-mono">{inv.lr?.vehicleNo || inv.vehicleNo || transporter?.vehicleNo || '—'}</div><div className="text-xs text-slate-600">Packages: {fmtNum(inv.lines.reduce((a, l) => a + l.qty, 0))} nos</div></div>
      </div>
      <div className="mt-6 text-xs text-slate-500">Goods received in good order and condition for carriage, subject to the conditions of carriage of {transporter?.name || 'the transporter'}.</div>
    </PrintArea>
  )
}

/** Generates an HTML brochure for a product (opens in any browser, printable to PDF) */
export function downloadBrochure(p, company) {
  const specs = Object.entries(p.specs || {}).map(([k, v]) => `<tr><td style="padding:6px 10px;color:#64748b;border-bottom:1px solid #eee">${k}</td><td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${v}</b></td></tr>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${p.name} – Brochure</title></head><body style="font-family:Segoe UI,Arial,sans-serif;max-width:720px;margin:32px auto;color:#0f172a">
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #f2541f;padding-bottom:12px"><div style="font-size:28px;font-weight:900;font-style:italic">B<span style="color:#f2541f">TALI</span></div><div style="font-size:12px;color:#64748b">${company?.website || 'www.btali.in'} · ${company?.phone || ''}</div></div>
<h1 style="margin:24px 0 4px">${p.name}</h1><div style="color:#64748b">${p.category} · Model ${p.sku}</div>
<p style="margin-top:16px;line-height:1.6">${p.description}</p>
<h3>Technical specifications</h3><table style="border-collapse:collapse;width:100%">${specs}<tr><td style="padding:6px 10px;color:#64748b">Warranty</td><td style="padding:6px 10px"><b>${p.warrantyMonths} months</b></td></tr><tr><td style="padding:6px 10px;color:#64748b">MRP (incl. taxes)</td><td style="padding:6px 10px"><b>${fmtINR(p.mrp)}</b></td></tr></table>
<p style="margin-top:32px;font-size:12px;color:#64748b">${company?.legalName || 'Btali International'} · ${company?.address || ''}</p></body></html>`
  downloadText(`${p.sku}-brochure.html`, html, 'text/html')
}

export function MiniStat({ label, value, sub, tone }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={cx('text-base font-bold tabular-nums', tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-ink-900')}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
}

export function SectionCard(props) {
  return <Card {...props} />
}

/** Consignment dispatched to the partner and not yet inward-scanned (historical invoices count as received) */
export const isPendingInward = (i, partnerId) => i.partnerId === partnerId && i.status === 'DISPATCHED' && !i.history && !i.inward?.acknowledged
