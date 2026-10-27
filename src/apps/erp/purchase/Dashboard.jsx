import React, { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wallet, ClipboardCheck, FileCheck2, Camera, Ship, AlertTriangle, Timer, Truck, BadgeCheck, Scale, Plus, ArrowRight, CalendarClock } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Badge, StatusBadge, Button, EmptyState, ProductImage } from '../../../components/ui'
import { BarsChart } from '../../../components/business'
import { fmtCompact, fmtINR, fmtDate, fmtNum, sum, daysBetween, today, fmtPct } from '../../../lib/format'
import { onHand } from '../../../lib/stock'
import { reorderRecommendation } from '../../../lib/analytics'
import { PO_FLOW, OPEN_PO, poValueINR, nextCycle, shipmentAlerts } from './_purchaseKit'

const URG = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export default function Dashboard() {
  const nav = useNavigate()
  const state = useStore()
  const { purchaseOrders: pos, shipments, products, vendors, settings } = state
  const fx = settings.fx

  const k = useMemo(() => {
    const open = pos.filter(OPEN_PO)
    const approved = pos.filter((p) => p.approvedAt && p.date)
    const cycle = approved.length ? sum(approved, (p) => Math.max(0, daysBetween(p.date, p.approvedAt.slice(0, 10)))) / approved.length : null
    const arrived = shipments.filter((s) => s.ata && s.eta)
    const tol = settings.alertRules?.containerDelayDays ?? 3
    const onTime = arrived.length ? (arrived.filter((s) => daysBetween(s.eta, s.ata) <= tol).length / arrived.length) * 100 : null
    const qcDone = pos.filter((p) => p.qcApprovedAt)
    const ftp = qcDone.length ? (qcDone.filter((p) => !p.qcRejectedOnce && !(p.qc || []).some((q) => q.status === 'REJECTED')).length / qcDone.length) * 100 : null
    // landed cost variance: finalised shipments, actual charges vs forecast landed factor
    let act = 0, fc = 0
    for (const s of shipments.filter((x) => x.landedCost?.finalized)) {
      const lc = s.landedCost
      const charges = ['freightINR', 'insurance', 'duty', 'cha', 'portTransport', 'other'].reduce((a, key) => a + (Number(lc[key]) || 0), 0)
      for (const po of pos.filter((p) => s.poIds.includes(p.id))) {
        for (const l of po.lines) {
          const p = products.find((x) => x.id === l.productId)
          const v = l.qty * l.rate * (fx[po.currency] || 1)
          fc += v * (p.type === 'SPARE' ? 1.32 : 1.28)
          act += v
        }
      }
      act += charges
    }
    const variance = fc ? ((act - fc) / fc) * 100 : null
    return {
      openValue: sum(open, (p) => poValueINR(p, fx)), openCount: open.length,
      pendingApproval: pos.filter((p) => p.status === 'PENDING_APPROVAL').length,
      piPending: pos.filter((p) => p.pi?.status === 'PENDING').length,
      qcPending: pos.filter((p) => (p.qc || []).some((q) => q.status === 'PENDING')).length,
      inTransit: shipments.filter((s) => ['BOOKED', 'IN_TRANSIT', 'AT_PORT', 'CLEARED'].includes(s.status)).length,
      breaches: products.filter((p) => p.active && onHand(state, p.id) < p.reorderLevel).length,
      cycle, approvedN: approved.length, onTime, arrivedN: arrived.length, ftp, qcN: qcDone.length, variance,
    }
  }, [pos, shipments, products, fx, settings, state])

  const pipeline = useMemo(() => PO_FLOW.map((s) => ({ ...s, count: pos.filter((p) => p.status === s.key).length, value: sum(pos.filter((p) => p.status === s.key), (p) => poValueINR(p, fx)) })), [pos, fx])
  const maxCount = Math.max(1, ...pipeline.map((p) => p.count))

  const etas = useMemo(() => shipments.filter((s) => s.status !== 'RECEIVED').sort((a, b) => a.eta.localeCompare(b.eta)), [shipments])

  const alerts = useMemo(() => products.filter((p) => p.active && onHand(state, p.id) < p.reorderLevel)
    .map((p) => ({ p, r: reorderRecommendation(state, p) }))
    .sort((a, b) => URG[a.r.urgency] - URG[b.r.urgency] || a.r.onHand / a.p.reorderLevel - b.r.onHand / b.p.reorderLevel)
    .slice(0, 6), [products, state])

  const byVendor = useMemo(() => {
    const m = {}
    for (const po of pos.filter((p) => !['REJECTED', 'CANCELLED', 'DRAFT'].includes(p.status))) {
      const v = vendors.find((x) => x.id === po.vendorId)
      const key = v?.code || po.vendorId
      m[key] = m[key] || { label: v?.name.split(' ').slice(0, 2).join(' ') || key, open: 0, closed: 0 }
      if (OPEN_PO(po)) m[key].open += poValueINR(po, fx)
      else m[key].closed += poValueINR(po, fx)
    }
    return Object.values(m).sort((a, b) => b.open + b.closed - (a.open + a.closed))
  }, [pos, vendors, fx])

  const cyc = nextCycle(settings.reorderCycleDay || 15)
  const go = (q) => nav(`/erp/purchase/orders${q}`)

  return (
    <div>
      <PageHeader title="Purchase Dashboard" subtitle={`Imports, domestic procurement & containers · next consolidation cycle ${fmtDate(cyc.date)} (${cyc.days} days)`}
        actions={<>
          <Button variant="secondary" icon={AlertTriangle} onClick={() => nav('/erp/purchase/reorder')}>Reorder alerts</Button>
          <Button icon={Plus} onClick={() => nav('/erp/purchase/orders?new=1')}>New PO</Button>
        </>} />

      <Grid cols={6}>
        <Stat label="Open PO value" value={fmtCompact(k.openValue)} sub={`${k.openCount} open POs`} icon={Wallet} onClick={() => go('')} />
        <Stat label="PO approvals" value={k.pendingApproval} sub="With Director" icon={ClipboardCheck} tone="amber" onClick={() => go('?status=PENDING_APPROVAL')} />
        <Stat label="PIs to approve" value={k.piPending} sub="Stamp & share" icon={FileCheck2} tone="violet" onClick={() => go('?status=PI_RECEIVED')} />
        <Stat label="QC pending" value={k.qcPending} sub="Media to review" icon={Camera} tone="blue" onClick={() => nav('/erp/purchase/qc')} />
        <Stat label="Containers" value={k.inTransit} sub="Booked / sailing / port" icon={Ship} tone="ink" onClick={() => nav('/erp/purchase/shipments')} />
        <Stat label="Reorder alerts" value={k.breaches} sub="Below threshold" icon={AlertTriangle} tone="red" onClick={() => nav('/erp/purchase/reorder')} />
      </Grid>

      <Grid cols={4} className="mt-4">
        <Stat label="PO cycle time" value={k.cycle == null ? '—' : `${k.cycle.toFixed(1)} days`} sub={`Creation → approval · ${k.approvedN} POs`} icon={Timer} tone="ink" />
        <Stat label="Vendor on-time delivery" value={fmtPct(k.onTime, 0)} sub={`${k.arrivedN} containers · ±${settings.alertRules?.containerDelayDays ?? 3}d tolerance`} icon={Truck} tone="green" />
        <Stat label="First-time QC pass rate" value={fmtPct(k.ftp, 0)} sub={`${k.qcN} POs QC-released`} icon={BadgeCheck} tone="green" />
        <Stat label="Landed cost vs forecast" value={k.variance == null ? '—' : `${k.variance > 0 ? '+' : ''}${k.variance.toFixed(1)}%`} sub="Finalised containers" icon={Scale} tone={k.variance > 2 ? 'red' : 'brand'} />
      </Grid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card title="PO pipeline" subtitle="Click a stage to open the filtered order list" className="xl:col-span-2">
          <div className="space-y-2">
            {pipeline.map((s) => (
              <button key={s.key} type="button" onClick={() => go(`?status=${s.key}`)} className="w-full flex items-center gap-3 group text-left">
                <span className="w-28 sm:w-32 text-xs font-medium text-slate-600 shrink-0 group-hover:text-brand-700">{s.label}</span>
                <div className="flex-1 h-6 bg-slate-50 rounded-md overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-md group-hover:from-brand-500 group-hover:to-brand-600 transition-colors" style={{ width: `${s.count ? Math.max(4, (s.count / maxCount) * 100) : 0}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-semibold tabular-nums">{s.count}</span>
                <span className="w-20 text-right text-xs text-slate-500 tabular-nums hidden sm:block">{s.value ? fmtCompact(s.value) : '—'}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Container ETAs" subtitle="Live board shared with Sales, Dispatch & Accounts" actions={<Link to="/erp/purchase/shipments" className="text-xs text-brand-600 hover:underline">Open board</Link>}>
          {etas.length === 0 ? <EmptyState icon={Ship} title="No containers en route" /> : (
            <ul className="divide-y divide-slate-100 -my-2">
              {etas.map((s) => {
                const d = daysBetween(today(), s.eta)
                const al = shipmentAlerts(s, settings)
                return (
                  <li key={s.id} className="py-2.5 flex items-center gap-3 cursor-pointer" onClick={() => nav(`/erp/purchase/shipments?id=${s.id}`)}>
                    <div className="w-12 text-center shrink-0">
                      <div className={`text-lg font-bold tabular-nums ${d < 0 ? 'text-red-600' : d <= 3 ? 'text-amber-600' : 'text-ink-900'}`}>{Math.abs(d)}</div>
                      <div className="text-[10px] uppercase text-slate-400">{d < 0 ? 'days late' : 'days'}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{s.containerNo} <span className="text-slate-400 font-normal">· {s.containerType}</span></div>
                      <div className="text-[11px] text-slate-500 truncate">{s.number} · ETA {fmtDate(s.eta)}{al.length ? ` · ${al[0].text}` : ''}</div>
                    </div>
                    <StatusBadge status={s.status} />
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <Card title="Top reorder alerts" subtitle="AI suggestion from 12-month seasonal demand, stock, bookings & pipeline" actions={<Link to="/erp/purchase/reorder" className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1">All alerts <ArrowRight className="w-3 h-3" /></Link>}>
          {alerts.length === 0 ? <EmptyState title="All products above threshold" /> : (
            <ul className="divide-y divide-slate-100 -my-2">
              {alerts.map(({ p, r }) => (
                <li key={p.id} className="py-2.5 flex items-center gap-3">
                  <ProductImage product={p} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{p.shortName}</div>
                    <div className="text-[11px] text-slate-500">On hand {fmtNum(r.onHand)} / reorder {fmtNum(p.reorderLevel)} · incoming {fmtNum(r.incoming)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{r.qty ? `Order ${fmtNum(r.qty)}` : 'Covered'}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 justify-end"><CalendarClock className="w-3 h-3" />{r.orderBy ? fmtDate(r.orderBy) : '—'}</div>
                  </div>
                  <Badge tone={r.urgency === 'CRITICAL' ? 'red' : r.urgency === 'HIGH' ? 'amber' : 'gray'}>{r.urgency}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Vendor-wise procurement" subtitle="PO value in INR (open vs completed)">
          <BarsChart data={byVendor} layout="vertical" height={Math.max(220, byVendor.length * 40)} stacked series={[{ key: 'open', label: 'Open' }, { key: 'closed', label: 'Received / closed', color: '#2f416b' }]} />
        </Card>
      </div>
    </div>
  )
}
