import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackageCheck, Truck, Ship, CalendarClock, FileWarning, AlertTriangle, Boxes, ArrowRight } from 'lucide-react'
import { useStore, useUser, useLookup } from '../../store'
import { PageHeader, Grid, Stat, Card, Button, StatusBadge, Badge, EmptyState } from '../../components/ui'
import { BarsChart } from '../../components/business'
import { fmtNum, fmtDate, today, addDays, daysBetween, sum } from '../../lib/format'
import { scheduleInvoices, invoiceWeight } from '../erp/dispatch/_shared'

export default function StarexDashboard() {
  const nav = useNavigate()
  const user = useUser()
  const { partner, transporter } = useLookup()
  const shipments = useStore((s) => s.shipments)
  const invoices = useStore((s) => s.invoices)
  const tickets = useStore((s) => s.tickets)
  const products = useStore((s) => s.products)
  const stock = useStore((s) => s.stock['WH-STAREX'] || {})
  const moves = useStore((s) => s.stockMoves)
  const t = today()
  const tomorrow = addDays(t, 1)

  const d = useMemo(() => {
    const upcoming = shipments.filter((s) => s.status !== 'RECEIVED').sort((a, b) => (a.eta < b.eta ? -1 : 1))
    const inwardToday = shipments.filter((s) => s.inward?.date === t)
    const inwardQty = sum(moves.filter((m) => m.locationId === 'WH-STAREX' && m.date === t && m.qty > 0), (m) => m.qty)
    const outToday = invoices.filter((i) => i.lr?.date === t && i.locationId !== 'WH-GUJ')
    const outQty = sum(outToday, (i) => sum(i.lines, (l) => l.qty))
    const sched = scheduleInvoices(invoices, tomorrow)
    const pendingLR = invoices.filter((i) => i.status === 'ISSUED' && i.locationId !== 'WH-GUJ')
    const complaints = tickets.filter((x) => x.source === 'STAREX' && !['RESOLVED', 'CLOSED'].includes(x.stage))
    const cats = {}
    for (const p of products) cats[p.category] = (cats[p.category] || 0) + (stock[p.id] || 0)
    const totalUnits = sum(Object.values(stock))
    const skus = products.filter((p) => (stock[p.id] || 0) > 0).length
    return { upcoming, inwardToday, inwardQty, outToday, outQty, sched, pendingLR, complaints, cats, totalUnits, skus }
  }, [shipments, invoices, tickets, products, stock, moves, t, tomorrow])

  return (
    <div>
      <PageHeader title={`Good day, ${user?.name?.split(' ')[0] || ''}`} subtitle={`Btali desk at Starex 3PL, Bhiwandi · ${fmtDate(t)}`}
        actions={<><Button variant="secondary" icon={CalendarClock} onClick={() => nav('/starex/schedule')}>Tomorrow's schedule</Button><Button icon={PackageCheck} onClick={() => nav('/starex/inward')}>Goods inward</Button></>} />
      <Grid cols={6}>
        <Stat label="Inward today" value={fmtNum(d.inwardQty)} sub={`${d.inwardToday.length} GRN`} icon={PackageCheck} tone="green" onClick={() => nav('/starex/inward')} />
        <Stat label="Outward today" value={fmtNum(d.outQty)} sub={`${d.outToday.length} invoices`} icon={Truck} tone="blue" onClick={() => nav('/starex/lr')} />
        <Stat label="Upcoming containers" value={d.upcoming.length} sub={d.upcoming[0] ? `next ETA ${fmtDate(d.upcoming[0].eta)}` : ''} icon={Ship} tone="ink" onClick={() => nav('/starex/containers')} />
        <Stat label="Tomorrow's dispatch" value={d.sched.length} sub="invoices to load" icon={CalendarClock} tone="brand" onClick={() => nav('/starex/schedule')} />
        <Stat label="Pending LRs" value={d.pendingLR.length} sub={`${d.pendingLR.filter((i) => i.starexStage === 'LOADED').length} loaded`} icon={FileWarning} tone="amber" onClick={() => nav('/starex/lr')} />
        <Stat label="Open complaints" value={d.complaints.length} icon={AlertTriangle} tone="red" onClick={() => nav('/starex/complaints')} />
      </Grid>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2" title="Upcoming container arrivals" subtitle="Plan bay space & manpower ahead of unloading" actions={<Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => nav('/starex/containers')}>All</Button>} padded={false}>
          {d.upcoming.length ? (
            <ul className="divide-y divide-slate-100">
              {d.upcoming.map((s) => {
                const days = daysBetween(t, s.eta)
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="p-2 rounded-lg bg-ink-50 text-ink-600"><Ship className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{s.number} · <span className="font-mono text-xs">{s.containerNo}</span></div>
                      <div className="text-xs text-slate-500">{s.containerType} · BL {s.blNo} {s.starexPlan?.bay ? `· ${s.starexPlan.bay}` : ''}</div>
                    </div>
                    <StatusBadge status={s.status} />
                    <div className="text-right w-24">
                      <div className="text-sm font-semibold text-slate-800">{fmtDate(s.eta)}</div>
                      <div className={days < 0 ? 'text-xs text-red-600' : 'text-xs text-slate-500'}>{days < 0 ? `${-days}d past ETA` : days === 0 ? 'today' : `in ${days}d`}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : <EmptyState title="No containers on the way" />}
        </Card>
        <Card title="Stock summary" subtitle={`${fmtNum(d.totalUnits)} units · ${d.skus} SKUs on hand`} actions={<Button size="sm" variant="ghost" icon={Boxes} onClick={() => nav('/starex/stock')}>Stock</Button>}>
          <BarsChart money={false} layout="vertical" height={230} data={Object.entries(d.cats).map(([label, v]) => ({ label, units: v }))} series={[{ key: 'units', label: 'Units' }]} />
        </Card>
      </div>

      <Card className="mt-4" title={`Dispatch plan for ${fmtDate(tomorrow)}`} subtitle="Invoices pushed by Btali Dispatch" actions={<Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => nav('/starex/schedule')}>Open schedule</Button>} padded={false}>
        {d.sched.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2">Invoice</th><th className="text-left px-4 py-2">Customer</th><th className="text-left px-4 py-2">Transporter</th><th className="text-right px-4 py-2">Qty</th><th className="text-right px-4 py-2">Weight</th><th className="text-left px-4 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.sched.slice(0, 8).map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2 font-mono text-xs">{i.number}{i.type === 'FOC' && <Badge tone="amber" className="ml-1">FOC</Badge>}</td>
                    <td className="px-4 py-2">{partner(i.partnerId)?.name}</td>
                    <td className="px-4 py-2">{transporter(i.transporterId)?.name}{i.safex && <Badge tone="violet" className="ml-1">Safex</Badge>}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNum(sum(i.lines, (l) => l.qty))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNum(invoiceWeight(i, products))} kg</td>
                    <td className="px-4 py-2">{i.starexStage ? <StatusBadge status={i.starexStage === 'LOADED' ? 'DONE' : 'IN_PROGRESS'} label={i.starexStage === 'LOADED' ? 'Loaded' : 'Picked'} /> : <StatusBadge status="PENDING" label="To pick" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No dispatches scheduled" message="New invoices from Btali Dispatch appear here automatically." />}
      </Card>
    </div>
  )
}
