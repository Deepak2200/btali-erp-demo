// Shared helpers for Purchase screens (Dashboard, Reorder, Orders, MRP, Barcodes, QC, Shipments, Container planning).
import React from 'react'
import { Link } from 'react-router-dom'
import { sum, addDays, today, daysBetween } from '../../../lib/format'
import { useUser } from '../../../store'

export const PO_FLOW = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'PENDING_APPROVAL', label: 'Approval' },
  { key: 'APPROVED', label: 'Sent to vendor' },
  { key: 'PI_RECEIVED', label: 'PI received' },
  { key: 'IN_PRODUCTION', label: 'Production' },
  { key: 'QC_PENDING', label: 'QC' },
  { key: 'READY_TO_SHIP', label: 'Ready to ship' },
  { key: 'SHIPPED', label: 'Shipped' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'CLOSED', label: 'Closed' },
]
export const DOMESTIC_FLOW = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'PENDING_APPROVAL', label: 'Approval' },
  { key: 'APPROVED', label: 'Sent to vendor' },
  { key: 'SHIPPED', label: 'Vendor dispatched' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'CLOSED', label: 'Closed' },
]
export const PO_STATUSES = [...PO_FLOW.map((s) => s.key), 'REJECTED', 'CANCELLED']
export const OPEN_PO = (po) => !['RECEIVED', 'CLOSED', 'REJECTED', 'CANCELLED', 'DRAFT'].includes(po.status)

export const CONTAINERS = {
  '20FT': { cbm: 33, kg: 21700, label: "20' Standard" },
  '40FT': { cbm: 67, kg: 26500, label: "40' Standard" },
  '40HC': { cbm: 76, kg: 26500, label: "40' High Cube" },
}

export const poValue = (po, fx = {}) => sum(po.lines, (l) => (Number(l.qty) || 0) * (Number(l.rate) || 0))
export const poValueINR = (po, fx = {}) => poValue(po) * (fx[po.currency] || 1)

/** Payment schedule derived from vendor terms */
export const paymentSchedule = (po, shipment, fx = {}) => {
  const t = po.paymentTerms || { advancePct: 0, balancePct: 100, creditDays: 0 }
  const total = poValue(po)
  const piDate = (po.pi?.approvedAt || po.approvedAt || po.date || today()).slice(0, 10)
  const baseDate = shipment?.etd || po.vendorDispatch?.date || po.deliverySchedule?.[0]?.date || addDays(piDate, 45)
  const rows = []
  if (t.advancePct) rows.push({ key: 'ADV', label: `Advance ${t.advancePct}%`, pct: t.advancePct, amount: (total * t.advancePct) / 100, due: addDays(piDate, 3), basis: 'On PI approval' })
  if (t.balancePct) rows.push({ key: 'BAL', label: `Balance ${t.balancePct}%`, pct: t.balancePct, amount: (total * t.balancePct) / 100, due: addDays(baseDate, t.creditDays || 0), basis: t.creditDays ? `${t.creditDays} days from ${shipment ? 'BL / ETD' : 'dispatch'}` : 'Before dispatch' })
  return rows.map((r) => ({ ...r, amountINR: r.amount * (fx[po.currency] || 1) }))
}

/** Days to the next reorder consolidation cycle (settings.reorderCycleDay) */
export const nextCycle = (day = 15) => {
  const d = new Date()
  let target = new Date(d.getFullYear(), d.getMonth(), day)
  if (d.getDate() > day) target = new Date(d.getFullYear(), d.getMonth() + 1, day)
  const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
  return { date: iso, days: Math.max(0, daysBetween(today(), iso)) }
}

export const shipmentAlerts = (sh, settings) => {
  if (sh.status === 'RECEIVED') return []
  const rules = settings.alertRules || {}
  const out = []
  const done = (k) => sh.milestones.find((m) => m.key === k)?.done
  const toEta = daysBetween(today(), sh.eta)
  if (!done('ARRIVED') && toEta >= 0 && toEta <= (rules.preEtaDays ?? 3)) out.push({ key: 'PRE_ETA', tone: 'amber', text: `Arriving in ${toEta} day(s) – keep CHA & Shiv Sai ready` })
  if (!done('ARRIVED') && toEta < 0) out.push({ key: 'OVERDUE', tone: 'red', text: `ETA passed ${-toEta} day(s) ago – arrival not confirmed` })
  if (sh.originalEta && daysBetween(sh.originalEta, sh.eta) >= (rules.containerDelayDays ?? 3)) out.push({ key: 'DELAY', tone: 'red', text: `Delayed ${daysBetween(sh.originalEta, sh.eta)} days vs original ETA` })
  if (toEta <= 3) for (const k of ['CAN', 'IGM']) if (!done(k)) out.push({ key: k, tone: 'amber', text: `${k} pending` })
  if (done('ARRIVED') && !done('BOE')) out.push({ key: 'BOE', tone: 'amber', text: 'Bill of Entry pending' })
  if (done('ARRIVED') && !sh.telexReleased) out.push({ key: 'TELEX', tone: 'amber', text: 'Telex release pending' })
  return out
}

export const useCanEdit = () => {
  const u = useUser()
  return { user: u, canEdit: ['PURCHASE', 'ADMIN'].includes(u?.role), isAdmin: u?.role === 'ADMIN' }
}

export const PoLink = ({ po }) => (po ? <Link to={`/erp/purchase/orders/${po.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-brand-700 hover:underline whitespace-nowrap">{po.number}</Link> : null)

/** Simple horizontal bar used for utilisation */
export function Bar({ pct, tone = 'brand', label }) {
  const c = pct > 100 ? 'bg-red-500' : { brand: 'bg-brand-500', ink: 'bg-ink-600', green: 'bg-emerald-500', blue: 'bg-sky-500', amber: 'bg-amber-500' }[tone]
  return (
    <div>
      {label && <div className="flex justify-between text-[11px] text-slate-500 mb-0.5"><span>{label}</span><span className="tabular-nums font-medium text-slate-700">{Math.round(pct)}%</span></div>}
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${c}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  )
}
