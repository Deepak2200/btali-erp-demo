import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Receipt, Clock, Timer, ShieldCheck, Truck, RotateCcw, GitCompare, Ship, CalendarClock, ArrowRight } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, Badge, StatusBadge, EmptyState } from '../../../components/ui'
import { PartnerCell, BarsChart, DonutChart } from '../../../components/business'
import { fmtINR, fmtNum, fmtDate, today, addDays, daysAgo, daysBetween, sum, round2 } from '../../../lib/format'
import { scheduleInvoices, invoiceWeight, lrAgeDays } from './_shared'
import { misSummary } from '../../../store/slices/dispatch'

export default function Dashboard() {
  const nav = useNavigate()
  const s = useStore()
  const { transporter, partner } = useLookup()
  const tomorrow = addDays(today(), 1)

  const d = useMemo(() => {
    const ready = s.salesOrders.filter((o) => o.status === 'PAID' && !o.invoiceId && (o.warehouseId || 'WH-STAREX') !== 'WH-GUJ')
    const awaitingLR = s.invoices.filter((i) => i.status === 'ISSUED' && i.locationId !== 'WH-GUJ')
    const sched = scheduleInvoices(s.invoices, tomorrow)
    const recent = s.invoices.filter((i) => i.lr && i.date >= daysAgo(90))
    const lead = recent.length ? round2(sum(recent, (i) => Math.max(0, daysBetween(i.date, i.lr.date))) / recent.length) : 0
    const sla = recent.length ? round2((recent.filter((i) => daysBetween(i.date, i.lr.date) <= 2).length / recent.length) * 100) : 100
    const last30 = s.invoices.filter((i) => i.date >= daysAgo(30) && i.type !== 'EXPORT')
    const mapped = last30.filter((i) => partner(i.partnerId)?.transporterId === i.transporterId).length
    const util = last30.length ? round2((mapped / last30.length) * 100) : 100
    const byTr = Object.entries(last30.reduce((m, i) => { const n = transporter(i.transporterId)?.name || 'Other'; m[n] = (m[n] || 0) + 1; return m }, {}))
      .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    const openReturns = (s.returns || []).filter((r) => r.status !== 'CLOSED').length
    const weekly = (s.misUploads || []).find((u) => u.kind === 'WEEKLY_TRUCK')
    const mismatch = weekly ? misSummary(weekly.results).mismatchRate : 0
    const containers = s.shipments.filter((x) => x.status !== 'RECEIVED').sort((a, b) => (a.eta < b.eta ? -1 : 1))
    // dispatch volume last 8 weeks
    const weeks = Array.from({ length: 8 }, (_, k) => {
      const to = daysAgo(k * 7), from = daysAgo(k * 7 + 6)
      const inv = s.invoices.filter((i) => i.lr && i.lr.date >= from && i.lr.date <= to)
      return { label: fmtDate(from).slice(0, 6), dispatches: inv.length, onTime: inv.filter((i) => daysBetween(i.date, i.lr.date) <= 2).length }
    }).reverse()
    return { ready, awaitingLR, sched, lead, sla, util, byTr, openReturns, mismatch, weekly, containers, weeks }
  }, [s.salesOrders, s.invoices, s.returns, s.misUploads, s.shipments, s.partners]) // eslint-disable-line

  return (
    <div className="space-y-5">
      <PageHeader title="Dispatch Control Tower" subtitle="Invoicing, LR, Starex schedule and reconciliation at a glance"
        actions={<>
          <Button variant="secondary" icon={CalendarClock} onClick={() => nav('/erp/dispatch/schedule')}>Tomorrow's schedule</Button>
          <Button icon={Receipt} onClick={() => nav('/erp/dispatch/invoices')}>Create invoices</Button>
        </>} />
      <Grid cols={4}>
        <Stat label="Ready to invoice" value={d.ready.length} sub={fmtINR(sum(d.ready, (o) => o.total))} icon={Receipt} onClick={() => nav('/erp/dispatch/invoices')} />
        <Stat label="Invoices awaiting LR" value={d.awaitingLR.length} sub={`${d.awaitingLR.filter((i) => lrAgeDays(i) > 2).length} beyond 48h SLA`} icon={Clock} tone="amber" onClick={() => nav('/erp/dispatch/lr')} />
        <Stat label="Avg lead time (invoice → LR)" value={`${d.lead} days`} sub="last 90 days" icon={Timer} tone="ink" />
        <Stat label="LR shared within 48h" value={`${d.sla}%`} sub="SLA compliance" icon={ShieldCheck} tone={d.sla >= 90 ? 'green' : 'red'} />
        <Stat label="Transporter mapping accuracy" value={`${d.util}%`} sub="used = Transport Master" icon={Truck} tone="blue" />
        <Stat label="Open returns / FOC" value={d.openReturns} icon={RotateCcw} tone="violet" onClick={() => nav('/erp/dispatch/returns')} />
        <Stat label="Weekly reconciliation mismatch" value={`${d.mismatch}%`} sub={d.weekly ? d.weekly.period : 'no report yet'} icon={GitCompare} tone={d.mismatch > 10 ? 'red' : 'green'} onClick={() => nav('/erp/dispatch/reconciliation')} />
        <Stat label="Tomorrow's dispatches" value={d.sched.length} sub={`${fmtNum(sum(d.sched, (i) => invoiceWeight(i, s.products)))} kg`} icon={CalendarClock} tone="brand" onClick={() => nav('/erp/dispatch/schedule')} />
      </Grid>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Ready to invoice" subtitle="Fully paid orders – stock is validated at invoicing" actions={<Button size="sm" variant="link" iconRight={ArrowRight} onClick={() => nav('/erp/dispatch/invoices')}>Open</Button>} padded={false}>
          {d.ready.length ? (
            <ul className="divide-y divide-slate-100">
              {d.ready.slice(0, 6).map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/erp/dispatch/invoices?so=${o.id}`)}>
                  <div className="flex-1 min-w-0"><PartnerCell id={o.partnerId} sub={`${o.number} · ${o.lines.length} lines`} /></div>
                  <span className="text-xs text-slate-500 hidden sm:block">{transporter(o.transporterId)?.name}</span>
                  <span className="text-sm font-semibold tabular-nums">{fmtINR(o.total)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nothing waiting" message="All paid orders have been invoiced." />}
        </Card>
        <Card title="Awaiting LR" subtitle="Invoices pushed to Starex, LR not yet uploaded" actions={<Button size="sm" variant="link" iconRight={ArrowRight} onClick={() => nav('/erp/dispatch/lr')}>Open</Button>} padded={false}>
          {d.awaitingLR.length ? (
            <ul className="divide-y divide-slate-100">
              {d.awaitingLR.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/erp/dispatch/invoices?id=${i.id}`)}>
                  <div className="flex-1 min-w-0"><PartnerCell id={i.partnerId} sub={`${i.number} · ${transporter(i.transporterId)?.name || ''}`} /></div>
                  {i.starexStage && <Badge tone="blue">{i.starexStage === 'LOADED' ? 'Loaded' : 'Picked'}</Badge>}
                  <Badge tone={lrAgeDays(i) > 2 ? 'red' : 'amber'}>{lrAgeDays(i)}d</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="All LRs received" />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Dispatches per week" subtitle="LRs uploaded vs within SLA" className="lg:col-span-2">
          <BarsChart data={d.weeks} money={false} series={[{ key: 'dispatches', label: 'Dispatched' }, { key: 'onTime', label: 'Within 48h' }]} />
        </Card>
        <Card title="Transporter utilisation" subtitle="Invoices, last 30 days">
          <DonutChart data={d.byTr.slice(0, 7)} money={false} height={200} />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Tomorrow's schedule" subtitle={fmtDate(tomorrow)} actions={<Button size="sm" variant="link" iconRight={ArrowRight} onClick={() => nav('/erp/dispatch/schedule')}>Schedule</Button>} padded={false}>
          {d.sched.length ? (
            <ul className="divide-y divide-slate-100">
              {d.sched.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0"><PartnerCell id={i.partnerId} sub={`${i.number}${i.type === 'FOC' ? ' · FOC' : ''}`} /></div>
                  <span className="text-xs text-slate-500">{transporter(i.transporterId)?.name}</span>
                  <span className="text-xs tabular-nums text-slate-600 w-16 text-right">{fmtNum(invoiceWeight(i, s.products))} kg</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No dispatches scheduled" />}
        </Card>
        <Card title="Upcoming container arrivals" subtitle="Plan Starex space & outbound" padded={false}>
          <ul className="divide-y divide-slate-100">
            {d.containers.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <Ship className="w-4 h-4 text-ink-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{c.number} · {c.containerNo}</div>
                  <div className="text-[11px] text-slate-500">{c.containerType} · BL {c.blNo}</div>
                </div>
                <StatusBadge status={c.status} />
                <span className="text-xs text-slate-600 w-24 text-right">ETA {fmtDate(c.eta)}</span>
              </li>
            ))}
            {!d.containers.length && <li className="px-4 py-6 text-sm text-slate-400 text-center">No containers inbound.</li>}
          </ul>
        </Card>
      </div>
    </div>
  )
}
