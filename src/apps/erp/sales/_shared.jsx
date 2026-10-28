// Shared building blocks for the Sales module screens.
import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Ship, PackageSearch } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import {
  Modal, Button, Field, FormGrid, Input, Select, Textarea, Combobox, Segmented, Badge, Alert, toast, cx,
} from '../../../components/ui'
import { LineItemsEditor, ProductCell } from '../../../components/business'
import { priceOrder } from '../../../lib/pricing'
import { onHand, bookStock, available, incoming, pendingOrderQty } from '../../../lib/stock'
import { fmtINR, fmtNum, fmtDate, today, addDays, sum, daysBetween, lastMonths, monthLabel, round2 } from '../../../lib/format'

export const SALES_PEOPLE = ['u5', 'u6', 'u7', 'u18']
export const REGIONS = ['North', 'South', 'East', 'West', 'Central']
export const CATEGORIES = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']
export const TASK_TYPES = [
  { value: 'VISIT', label: 'Dealer visit' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'COLLECTION', label: 'Payment collection' },
  { value: 'CALL', label: 'Call' },
  { value: 'DEMO', label: 'Product demo' },
]
export const taskTypeLabel = (t) => TASK_TYPES.find((x) => x.value === t)?.label || t
export const STAGES = [
  { key: 'IN_DECISION', label: 'In-Decision', tone: 'amber' },
  { key: 'CURRENT', label: 'Current Dealers', tone: 'green' },
  { key: 'DEAD', label: 'Dead Buyers', tone: 'red' },
]

// ------------------------------------------------------------------ visibility scope
/** Sales executives default to their own dealers (assigned or in their regions); managers/director see all. */
export function useScope() {
  const user = useUser()
  const partners = useStore((s) => s.partners)
  const isExec = user?.role === 'SALES_EXEC'
  const [mine, setMine] = useState(isExec)
  const ownIds = useMemo(() => new Set(partners.filter((p) => p.salespersonId === user?.id || (user?.regions || []).includes(p.region)).map((p) => p.id)), [partners, user])
  const inScope = (partnerId) => !mine || ownIds.has(partnerId)
  const isOwnTask = (t) => !mine || t.assigneeId === user?.id
  const canManage = user?.role !== 'SALES_EXEC'
  return { user, isExec, mine, setMine, inScope, ownIds, isOwnTask, canManage }
}
export function ScopeToggle({ scope }) {
  if (!scope.user) return null
  return (
    <Segmented size="sm" value={scope.mine ? 'mine' : 'all'} onChange={(v) => scope.setMine(v === 'mine')}
      options={[{ key: 'mine', label: scope.isExec ? 'My dealers' : 'My accounts' }, { key: 'all', label: 'All dealers' }]} />
  )
}

// ------------------------------------------------------------------ periods / targets
export const periodMonths = (t) => {
  const [y, m] = t.period.split('-').map(Number)
  const n = t.periodType === 'QUARTER' ? 3 : 1
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}
export const periodLabel = (periodType, period) => {
  if (periodType !== 'QUARTER') return monthLabel(period)
  const ms = periodMonths({ periodType, period })
  const [y, m] = period.split('-').map(Number)
  const fq = m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4
  const fy = m >= 4 ? y : y - 1
  return `Q${fq} FY${String(fy).slice(2)}-${String(fy + 1).slice(2)} (${monthLabel(ms[0]).split(' ')[0]}–${monthLabel(ms[2])})`
}
export const quarterStartOf = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number)
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}`
}
/** taxable invoiced value in the target period */
export const achievedFor = (state, t) => {
  const ms = new Set(periodMonths(t))
  const pIds = t.ownerType === 'DEALER' ? new Set([t.ownerId]) : new Set(state.partners.filter((p) => p.salespersonId === t.ownerId).map((p) => p.id))
  return round2(sum(state.invoices.filter((i) => pIds.has(i.partnerId) && ms.has(i.date.slice(0, 7)) && (!i.type || i.type === 'TAX' || i.type === 'EXPORT')), (i) => i.subtotal))
}
export const slabFor = (slabs, pct) => [...(slabs || [])].sort((a, b) => b.achievePct - a.achievePct).find((s) => pct >= s.achievePct) || null
export const targetRow = (state, t) => {
  const achieved = achievedFor(state, t)
  const pct = t.amount ? round2((achieved / t.amount) * 100) : 0
  const slab = slabFor(t.slabs, pct)
  const next = [...(t.slabs || [])].sort((a, b) => a.achievePct - b.achievePct).find((s) => pct < s.achievePct)
  return { ...t, achieved, pct, slab, incentive: slab ? round2((achieved * slab.incentivePct) / 100) : 0, gapToNext: next ? Math.max(0, round2((t.amount * next.achievePct) / 100 - achieved)) : 0, next }
}

// ------------------------------------------------------------------ dealer stats
export const dealerStats = (state, partnerId) => {
  const invs = state.invoices.filter((i) => i.partnerId === partnerId)
  const from12 = addDays(today(), -365)
  const rev12 = sum(invs.filter((i) => i.date >= from12), (i) => i.subtotal)
  const orders = state.salesOrders.filter((s) => s.partnerId === partnerId && s.status !== 'CANCELLED')
  const outstanding = sum(orders.filter((s) => ['CONFIRMED', 'PENDING_REVIEW'].includes(s.status) || (s.paymentStatus !== 'PAID' && s.status !== 'CANCELLED')), (s) => s.total - (s.paidAmount || 0))
  const p = state.partners.find((x) => x.id === partnerId)
  const last = p?.lastOrderDate || orders.reduce((a, s) => (s.date > a ? s.date : a), '') || null
  return { rev12: round2(rev12), orders: orders.length, avgOrder: orders.length ? round2(sum(orders, (s) => s.subtotal) / orders.length) : 0, lastOrder: last, outstanding: round2(outstanding), daysSince: last ? daysBetween(last, today()) : null }
}
export const isInactive = (p, settings) => p.stage === 'CURRENT' && p.type === 'DEALER' && (!p.lastOrderDate || daysBetween(p.lastOrderDate, today()) > (settings.alertRules?.dealerInactiveDays || 45))
export const monthlyRevenue = (state, partnerIds, n = 12) => {
  const ms = lastMonths(n)
  const set_ = partnerIds ? new Set(partnerIds) : null
  const m = {}
  for (const i of state.invoices) {
    if (set_ && !set_.has(i.partnerId)) continue
    const k = i.date.slice(0, 7)
    m[k] = (m[k] || 0) + i.subtotal
  }
  return ms.map((k) => ({ month: k, label: monthLabel(k), revenue: round2(m[k] || 0) }))
}

// ------------------------------------------------------------------ stock helpers
export const stockInfo = (state, productId) => {
  const inc = incoming(state, productId)
  return { onHand: onHand(state, productId), book: bookStock(state, productId), available: available(state, productId), pending: pendingOrderQty(state, productId), incoming: inc, incomingQty: sum(inc, (x) => x.qty), nextEta: inc.map((x) => x.eta).filter(Boolean).sort()[0] || null }
}

/** Per-line availability check shown under order / quotation editors. */
export function LineStockCheck({ lines }) {
  const state = useStore()
  const rows = lines.filter((l) => l.productId && Number(l.qty) > 0)
  if (!rows.length) return null
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 text-[11px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5"><PackageSearch className="w-3.5 h-3.5" />Live stock check – Btali Bhiwandi</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-slate-400"><tr><th className="text-left px-3 py-1.5">Product</th><th className="text-right px-3">Ordered</th><th className="text-right px-3">On hand</th><th className="text-right px-3">Book stock</th><th className="text-right px-3">Available</th><th className="text-left px-3">Incoming</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((l, i) => {
              const s = stockInfo(state, l.productId)
              const short = Number(l.qty) > s.available
              return (
                <tr key={i} className={short ? 'bg-amber-50/60' : ''}>
                  <td className="px-3 py-1.5"><ProductCell id={l.productId} size="xs" /></td>
                  <td className="px-3 text-right tabular-nums font-medium">{fmtNum(l.qty)}</td>
                  <td className="px-3 text-right tabular-nums">{fmtNum(s.onHand)}</td>
                  <td className="px-3 text-right tabular-nums text-slate-500">{fmtNum(s.book)}</td>
                  <td className={cx('px-3 text-right tabular-nums font-semibold', short ? 'text-amber-700' : 'text-emerald-700')}>{fmtNum(s.available)}{short && <AlertTriangle className="inline w-3.5 h-3.5 ml-1 -mt-0.5" />}</td>
                  <td className="px-3 text-xs text-slate-600 whitespace-nowrap">{s.incomingQty ? <span className="inline-flex items-center gap-1"><Ship className="w-3.5 h-3.5 text-sky-600" />{fmtNum(s.incomingQty)}{s.nextEta ? ` · ETA ${fmtDate(s.nextEta)}` : ' · in production'}</span> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.some((l) => Number(l.qty) > stockInfo(state, l.productId).available) && (
        <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border-t border-amber-100">Some lines exceed available stock. The order can be booked, but invoicing will be blocked until stock arrives – share the incoming ETA with the dealer.</div>
      )}
    </div>
  )
}

/** Pricing preview (schemes, combo & BOGO applied) */
export function PricedSummary({ partnerId, lines }) {
  const state = useStore()
  const priced = useMemo(() => (partnerId ? priceOrder(state, partnerId, lines) : null), [state, partnerId, lines])
  if (!priced || !priced.lines.length) return null
  const schemes = priced.appliedSchemes.map((id) => state.schemes.find((s) => s.id === id)).filter(Boolean)
  const free = priced.lines.filter((l) => l.free)
  const mrpValue = sum(priced.lines.filter((l) => !l.free), (l) => l.mrp * l.qty)
  return (
    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/60 text-sm space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-slate-500 mr-1">Schemes applied:</span>
        {schemes.length ? schemes.map((s) => <Badge key={s.id} tone="violet">{s.code}</Badge>) : <span className="text-xs text-slate-400">None</span>}
        {free.map((l, i) => <Badge key={i} tone="green">FREE {l.qty} × {state.products.find((p) => p.id === l.productId)?.shortName}</Badge>)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div><div className="text-[11px] text-slate-400">MRP value</div><div className="tabular-nums">{fmtINR(mrpValue)}</div></div>
        <div><div className="text-[11px] text-slate-400">Taxable</div><div className="tabular-nums">{fmtINR(priced.subtotal)}</div></div>
        <div><div className="text-[11px] text-slate-400">GST 18%</div><div className="tabular-nums">{fmtINR(priced.gst)}</div></div>
        <div><div className="text-[11px] text-slate-400">Order total</div><div className="tabular-nums font-bold text-ink-900">{fmtINR(priced.total)}</div></div>
      </div>
    </div>
  )
}

export const partnerOptions = (partners, filter = () => true) =>
  partners.filter((p) => p.status === 'ACTIVE' && filter(p)).map((p) => ({ value: p.id, label: p.name, sub: `${p.code} · ${p.city} · ${p.type === 'DEALER' ? `Tier ${p.tier}` : p.type.toLowerCase()}` }))

// ------------------------------------------------------------------ new sales order modal
export function NewOrderModal({ open, onClose, initial, scope }) {
  const state = useStore()
  const createSalesOrder = useStore((s) => s.createSalesOrder)
  const navigate = useNavigate()
  const [partnerId, setPartnerId] = useState(initial?.partnerId || '')
  const [lines, setLines] = useState(initial?.lines || [{ productId: '', qty: 1 }])
  const [note, setNote] = useState(initial?.note || '')
  const [transporterId, setTransporterId] = useState('')
  const partner = state.partners.find((p) => p.id === partnerId)
  const opts = partnerOptions(state.partners, (p) => p.type !== 'EXPORT' && (!scope || scope.inScope(p.id)))
  const authorised = partner?.authorizedCategories?.length ? partner.authorizedCategories : null
  const submit = () => {
    if (!partnerId) return toast.error('Select a dealer')
    const valid = lines.filter((l) => l.productId && Number(l.qty) > 0)
    if (!valid.length) return toast.error('Add at least one product line')
    const so = createSalesOrder({ partnerId, lines: valid.map((l) => ({ productId: l.productId, qty: Number(l.qty) })), source: 'SALES', note, transporterId: transporterId || undefined })
    toast.success(`Sales order ${so.number} confirmed`, `Confirmation emailed to ${partner.email}. Accounts notified to expect the advance.`)
    onClose()
    navigate(`/erp/sales/orders/${so.id}`)
  }
  return (
    <Modal open={open} onClose={onClose} size="xl" title={initial?.title || 'New sales order'} subtitle="Prices are applied automatically from the dealer's price list, slabs and live schemes. No approval needed – confirmation is emailed on save."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Confirm order & email dealer</Button></>}>
      <div className="space-y-4">
        <FormGrid cols={3}>
          <Field label="Dealer / franchise" required className="md:col-span-2"><Combobox options={opts} value={partnerId} onChange={(v) => { setPartnerId(v); setLines((ls) => ls.map((l) => ({ productId: l.productId, qty: l.qty }))) }} placeholder="Search dealer…" /></Field>
          <Field label="Transporter" hint={partner ? `Default: ${state.transporters.find((t) => t.id === partner.transporterId)?.name || '—'}` : undefined}>
            <Select value={transporterId} onChange={(e) => setTransporterId(e.target.value)} placeholder="Dealer default" options={state.transporters.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
        </FormGrid>
        {partner && (
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <Badge tone="ink">{state.priceLists.find((p) => p.id === partner.priceListId)?.name}</Badge>
            {partner.extraDiscountPct ? <Badge tone="brand">+{partner.extraDiscountPct}% dealer extra</Badge> : null}
            <Badge>{partner.paymentTerms || 'Advance'}</Badge>
            <span>{partner.city} · {partner.region}</span>
          </div>
        )}
        <LineItemsEditor key={partnerId} lines={lines} onChange={setLines} mode="dealer" partnerId={partnerId} productFilter={authorised ? (p) => authorised.includes(p.category) : undefined} />
        <PricedSummary partnerId={partnerId} lines={lines} />
        <LineStockCheck lines={lines} />
        <Field label="Note to dealer / dispatch"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Deliver before Diwali, include brochures" /></Field>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ task modal
export function TaskModal({ open, onClose, initial = {}, task }) {
  const state = useStore()
  const user = useUser()
  const addTask = useStore((s) => s.addTask)
  const updateTask = useStore((s) => s.updateTask)
  const base = task || initial
  const [f, setF] = useState({
    title: base.title || '', type: base.type || 'FOLLOW_UP', partnerId: base.partnerId || '', soId: base.soId || '',
    assigneeId: base.assigneeId || (user?.role === 'SALES_EXEC' ? user.id : (state.partners.find((p) => p.id === base.partnerId)?.salespersonId || 'u5')),
    dueDate: base.dueDate || today(), priority: base.priority || 'MEDIUM', notes: base.notes || '', location: base.location || '',
  })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const people = state.users.filter((u) => ['SALES_EXEC', 'SALES_MANAGER'].includes(u.role))
  const orders = state.salesOrders.filter((s) => s.partnerId === f.partnerId && !s.history).slice(0, 20)
  const save = () => {
    if (!f.title.trim()) return toast.error('Enter a task title')
    const loc = f.location || state.partners.find((p) => p.id === f.partnerId)?.city || ''
    const data = { ...f, partnerId: f.partnerId || null, soId: f.soId || null, location: loc }
    if (task) { updateTask(task.id, data); toast.success('Task updated') }
    else {
      addTask(data)
      toast.success('Task created', `Assigned to ${state.users.find((u) => u.id === f.assigneeId)?.name}`)
    }
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New sales task'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>{task ? 'Save' : 'Create task'}</Button></>}>
      <FormGrid>
        <Field label="Title" required className="md:col-span-2"><Input value={f.title} onChange={set('title')} placeholder="e.g. Visit dealer for Diwali scheme briefing" /></Field>
        <Field label="Type"><Select value={f.type} onChange={set('type')} options={TASK_TYPES} /></Field>
        <Field label="Priority"><Select value={f.priority} onChange={set('priority')} options={['HIGH', 'MEDIUM', 'LOW'].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() }))} /></Field>
        <Field label="Dealer"><Combobox options={[{ value: '', label: '— None —' }, ...state.partners.filter((p) => p.status !== 'REJECTED').map((p) => ({ value: p.id, label: p.name, sub: `${p.city} · ${p.region}` }))]} value={f.partnerId} onChange={(v) => setF((s) => ({ ...s, partnerId: v, soId: '' }))} placeholder="Link a dealer" /></Field>
        <Field label="Linked order"><Select value={f.soId} onChange={set('soId')} placeholder="— None —" options={orders.map((o) => ({ value: o.id, label: `${o.number} · ${fmtINR(o.total)}` }))} /></Field>
        <Field label="Assign to"><Select value={f.assigneeId} onChange={set('assigneeId')} disabled={user?.role === 'SALES_EXEC'} options={people.map((u) => ({ value: u.id, label: `${u.name} – ${u.title.replace('Sales Executive – ', '')}` }))} /></Field>
        <Field label="Due date"><Input type="date" value={f.dueDate} onChange={set('dueDate')} /></Field>
        <Field label="Notes" className="md:col-span-2"><Textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </FormGrid>
    </Modal>
  )
}

export function StockLookupResult({ productId }) {
  const state = useStore()
  const p = state.products.find((x) => x.id === productId)
  if (!p) return null
  const s = stockInfo(state, productId)
  const guj = onHand(state, productId, 'WH-GUJ')
  return (
    <div className="space-y-3">
      <ProductCell product={p} sub={`${p.category} · MRP ${fmtINR(p.mrp)}`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['In hand', s.onHand, 'text-ink-900'], ['Book stock', s.book, 'text-violet-700'], ['Available to sell', s.available, s.available > 0 ? 'text-emerald-700' : 'text-red-600'], ['Incoming', s.incomingQty, 'text-sky-700']].map(([l, v, c]) => (
          <div key={l} className="rounded-lg bg-slate-50 border border-slate-100 p-2"><div className="text-[11px] text-slate-500">{l}</div><div className={cx('text-lg font-bold tabular-nums', c)}>{fmtNum(v)}</div></div>
        ))}
      </div>
      <div className="text-xs text-slate-500">{s.pending ? `${fmtNum(s.pending)} more in confirmed orders awaiting payment. ` : ''}{guj ? `Gujarat facility: ${fmtNum(guj)}. ` : ''}Reorder level {fmtNum(p.reorderLevel)}.</div>
      {s.incoming.length > 0 && (
        <ul className="text-xs divide-y divide-slate-100 border border-slate-100 rounded-lg">
          {s.incoming.map((x) => <li key={x.poId} className="flex justify-between gap-2 px-2 py-1.5"><span>{x.poNumber} · {String(x.stage).replace(/_/g, ' ').toLowerCase()}</span><span className="tabular-nums">{fmtNum(x.qty)} · {x.eta ? `ETA ${fmtDate(x.eta)}` : 'date TBC'}</span></li>)}
        </ul>
      )}
      {p.type === 'FG' && p.bom?.length > 0 && (
        <div className="text-xs text-slate-600"><span className="font-medium">Spares: </span>{p.bom.map((b) => { const sp = state.products.find((x) => x.id === b.productId); return `${sp?.shortName} (${fmtNum(available(state, b.productId))})` }).join(' · ')}</div>
      )}
    </div>
  )
}

export function Empty({ children }) { return <Alert tone="info">{children}</Alert> }
