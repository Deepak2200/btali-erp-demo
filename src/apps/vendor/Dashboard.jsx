import React, { useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ShoppingCart, ClipboardList, Factory, Ship, Bell, Banknote, ArrowRight, Truck, CheckCircle2, ScanLine } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Grid, Stat, Card, Badge, StatusBadge, Button, EmptyState, openAttachment, cx } from '../../components/ui'
import { fmtDate, timeAgo } from '../../lib/format'
import { useVendorScope, OPEN, poActions, poTotal, fmtUSD, forwarderFor, PO_STEPS } from './_parts'

export default function Dashboard() {
  const { user, vendorId, pos } = useVendorScope()
  const units = useStore((s) => s.units)
  const shipments = useStore((s) => s.shipments)
  const vendorDocs = useStore((s) => s.vendorDocs) || []
  const vendorBills = useStore((s) => s.vendorBills) || []
  const notifications = useStore((s) => s.notifications)
  const tickets = useStore((s) => s.tickets)
  const claims = useStore((s) => s.warrantyClaims)
  const vendor = useStore((s) => s.vendors.find((v) => v.id === vendorId))
  const nav = useNavigate()
  const state = useStore.getState()

  const open = pos.filter((p) => OPEN.includes(p.status))
  const ctx = { units, shipments, vendorDocs }
  const actions = useMemo(() => pos.flatMap((po) => poActions(po, ctx).map((a) => ({ ...a, po }))), [pos, units, shipments, vendorDocs]) // eslint-disable-line
  const escalations = tickets.filter((t) => t.vendorId === vendorId && t.escalatedToVendor && !t.vendorResponse && !['RESOLVED', 'CLOSED'].includes(t.stage)).length + claims.filter((c) => c.vendorClaim?.vendorId === vendorId && c.vendorClaim.status === 'AWAITING_VENDOR').length
  const notes = notifications.filter((n) => n.vendorId === vendorId).slice(0, 8)
  const payments = [
    ...vendorDocs.filter((d) => d.vendorId === vendorId && d.docType === 'SWIFT').map((d) => ({ id: d.id, title: d.title, amount: d.amount, currency: d.currency, date: d.date, ref: d.ref, file: d.file })),
    ...vendorBills.filter((b) => b.vendorId === vendorId && b.status === 'PAID').map((b) => ({ id: b.id, title: `Payment – ${b.vendorRef || b.number}`, amount: b.amount, currency: b.currency, date: (b.paidAt || b.date || '').slice(0, 10), ref: b.paymentRef, file: b.swift })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1))
  const forwarders = pos.filter((p) => ['READY_TO_SHIP', 'SHIPPED'].includes(p.status)).map((po) => ({ po, ...forwarderFor(state, po) }))
  const byStatus = PO_STEPS.map((s) => ({ ...s, n: pos.filter((p) => p.status === s.key).length }))

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.name?.split(' ')[0] || ''}`} subtitle={`${vendor?.name} · Btali supplier portal`}
        actions={<><Button variant="secondary" icon={ScanLine} onClick={() => nav('/vendor/scan-pack')}>Scan-to-pack</Button><Button icon={ShoppingCart} onClick={() => nav('/vendor/orders')}>Purchase orders</Button></>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Open purchase orders" value={open.length} icon={ShoppingCart} sub={fmtUSD(open.reduce((a, p) => a + poTotal(p), 0))} onClick={() => nav('/vendor/orders')} />
        <Stat label="Actions required" value={actions.length} icon={ClipboardList} tone={actions.length ? 'amber' : 'green'} />
        <Stat label="In production" value={pos.filter((p) => ['IN_PRODUCTION', 'QC_PENDING'].includes(p.status)).length} icon={Factory} tone="blue" />
        <Stat label="Btali escalations" value={escalations} icon={Bell} tone={escalations ? 'red' : 'green'} sub="awaiting your reply" onClick={() => nav('/vendor/tickets')} />
      </Grid>

      <Card title="Orders by stage" className="mb-4">
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          {byStatus.map((s) => (
            <button key={s.key} type="button" onClick={() => nav(`/vendor/orders?status=${s.key}`)} className={cx('rounded-xl border p-3 text-left transition-colors', s.n ? 'border-brand-200 bg-brand-50/50 hover:border-brand-400' : 'border-slate-200 bg-slate-50')}>
              <div className="text-2xl font-bold text-ink-900">{s.n}</div>
              <div className="text-[11px] text-slate-500">{s.label}</div>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Action required" subtitle="Complete these to keep your orders moving" className="lg:col-span-2" padded={false}>
          {actions.length === 0 ? <EmptyState icon={CheckCircle2} title="You’re all caught up" message="No pending actions on your orders." /> : (
            <ul className="divide-y divide-slate-100">
              {actions.map((a, i) => (
                <li key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/vendor/orders/${a.po.id}?tab=${a.tab}`)}>
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><ClipboardList className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium text-ink-900">{a.label}</div><div className="text-xs text-slate-500">{a.po.number} · {fmtUSD(poTotal(a.po), a.po.currency)}</div></div>
                  <StatusBadge status={a.po.status} />
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Notifications" padded={false}>
          {notes.length === 0 ? <EmptyState icon={Bell} title="No notifications" /> : (
            <ul className="divide-y divide-slate-100">
              {notes.map((n) => (
                <li key={n.id} className="px-4 py-2.5 cursor-pointer hover:bg-slate-50" onClick={() => n.link && nav(n.link)}>
                  <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">{!n.read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />}{n.title}</div>
                  <div className="text-xs text-slate-500 line-clamp-2">{n.body}</div>
                  <div className="text-[11px] text-slate-400">{timeAgo(n.ts)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Payments received (SWIFT)" className="lg:col-span-2" padded={false}>
          {payments.length === 0 ? <EmptyState icon={Banknote} title="No payments yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Payment</th><th className="text-left px-4 py-2">Bank ref</th><th className="text-right px-4 py-2">Amount</th><th className="px-4 py-2" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 whitespace-nowrap">{fmtDate(p.date)}</td>
                      <td className="px-4 py-2">{p.title}</td>
                      <td className="px-4 py-2 font-mono text-xs">{p.ref || '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtUSD(p.amount, p.currency)}</td>
                      <td className="px-4 py-2 text-right">{p.file && <Button size="sm" variant="link" onClick={() => openAttachment(p.file)}>SWIFT copy</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Assigned freight forwarders" padded={false}>
          {forwarders.length === 0 ? <EmptyState icon={Ship} title="No shipments being booked" /> : (
            <ul className="divide-y divide-slate-100">
              {forwarders.map(({ po, forwarder, shipment }) => (
                <li key={po.id} className="px-4 py-3">
                  <Link to={`/vendor/orders/${po.id}?tab=forwarder`} className="text-xs font-mono font-semibold text-ink-700">{po.number}</Link>
                  {forwarder ? (
                    <div className="mt-1 text-sm"><div className="font-medium flex items-center gap-1.5"><Truck className="w-4 h-4 text-brand-500" />{forwarder.name}</div><div className="text-xs text-slate-500">{forwarder.contact} · {forwarder.phone}</div>{shipment && <div className="text-xs text-slate-500">{shipment.containerNo} · ETD {fmtDate(shipment.etd)}</div>}</div>
                  ) : <div className="text-xs text-slate-500 mt-1">Forwarder nomination in progress at Btali</div>}
                  {shipment && <Badge tone="blue" className="mt-1">{shipment.status.replace(/_/g, ' ')}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
