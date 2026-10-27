import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Target, Receipt, FileCheck2, Boxes, Plus, Ship, Lightbulb, ListTodo, CheckCircle2, ArrowRight, Search, Clock } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Grid, Stat, Button, Badge, StatusBadge, Combobox, Progress, EmptyState, prompt, toast, cx } from '../../../components/ui'
import { TrendChart, PartnerCell, FMSBadge, ProductCell } from '../../../components/business'
import { fmsMap, dealerNudges } from '../../../lib/analytics'
import { bookStock } from '../../../lib/stock'
import { fmtINR, fmtCompact, fmtDate, fmtNum, sum, today, daysBetween, lastMonths, monthLabel, round2 } from '../../../lib/format'
import { useScope, ScopeToggle, NewOrderModal, TaskModal, StockLookupResult, targetRow, quarterStartOf, taskTypeLabel } from './_shared'

export default function Dashboard() {
  const state = useStore()
  const scope = useScope()
  const navigate = useNavigate()
  const completeTask = useStore((s) => s.completeTask)
  const [newOrder, setNewOrder] = useState(false)
  const [newTask, setNewTask] = useState(false)
  const [lookup, setLookup] = useState('p2')
  const month = today().slice(0, 7)
  const inScope = scope.inScope

  const d = useMemo(() => {
    const invs = state.invoices.filter((i) => inScope(i.partnerId))
    const mtd = sum(invs.filter((i) => i.date.startsWith(month)), (i) => i.subtotal)
    // target: salesperson quarterly (exec in "mine") pro-rated, else sum of dealer monthly targets in scope
    let target
    if (scope.isExec && scope.mine) {
      const t = (state.targets || []).find((x) => x.ownerType === 'SALESPERSON' && x.ownerId === scope.user.id && x.period === quarterStartOf(month))
      target = t ? t.amount / 3 : 0
    } else target = sum((state.targets || []).filter((t) => t.ownerType === 'DEALER' && t.period === month && inScope(t.ownerId)), (t) => t.amount)
    const ms = lastMonths(12)
    const byM = {}
    for (const i of invs) { const k = i.date.slice(0, 7); byM[k] = (byM[k] || 0) + i.subtotal }
    const trend = ms.map((k) => ({ label: monthLabel(k), revenue: round2(byM[k] || 0) }))
    const prevMonth = ms[ms.length - 2]
    const dayOfMonth = Number(today().slice(8, 10))
    const prevSameDays = sum(invs.filter((i) => i.date.startsWith(prevMonth) && Number(i.date.slice(8, 10)) <= dayOfMonth), (i) => i.subtotal)
    const orders = state.salesOrders.filter((o) => inScope(o.partnerId))
    const awaiting = orders.filter((o) => o.status === 'CONFIRMED')
    const review = orders.filter((o) => o.status === 'PENDING_REVIEW')
    const ready = orders.filter((o) => o.status === 'PAID')
    const bookValue = sum(state.products, (p) => bookStock(state, p.id) * p.landedCost)
    const from90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
    const dealerRev = {}
    for (const i of invs.filter((x) => x.date >= from90)) dealerRev[i.partnerId] = (dealerRev[i.partnerId] || 0) + i.subtotal
    const top = Object.entries(dealerRev).sort((a, b) => b[1] - a[1]).slice(0, 6)
    const fms = fmsMap(state, 90)
    const fmsCount = { F: 0, M: 0, S: 0 }
    Object.values(fms).forEach((x) => { fmsCount[x.cls]++ })
    const fastLow = state.products.filter((p) => fms[p.id]?.cls === 'F' && (state.stock['WH-STAREX']?.[p.id] || 0) < p.reorderLevel)
    const nudges = dealerNudges(state).filter((n) => inScope(n.partnerId))
    const actioned = new Set((state.nudgeActions || []).filter((a) => daysBetween(a.date, today()) <= 14).map((a) => a.partnerId))
    const myTasks = (state.tasks || []).filter((t) => t.status === 'OPEN' && t.dueDate <= today() && (scope.mine ? t.assigneeId === scope.user?.id || (!scope.isExec && inScope(t.partnerId)) : true)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const ships = state.shipments.filter((s) => s.status !== 'RECEIVED').sort((a, b) => a.eta.localeCompare(b.eta))
    return { mtd, target, trend, prevSameDays, awaiting, review, ready, bookValue, top, fms, fmsCount, fastLow, nudges: nudges.filter((n) => !actioned.has(n.partnerId)), myTasks, ships }
  }, [state, scope.mine]) // eslint-disable-line

  const pct = d.target ? (d.mtd / d.target) * 100 : 0
  const growth = d.prevSameDays ? ((d.mtd - d.prevSameDays) / d.prevSameDays) * 100 : null
  const done = async (t) => {
    const o = await prompt({ title: `Complete: ${t.title}`, label: 'Outcome', required: true, confirmText: 'Mark done' })
    if (!o) return
    completeTask(t.id, o)
    toast.success('Task completed')
  }

  return (
    <div>
      <PageHeader title={`Sales Dashboard${scope.isExec && scope.mine ? ` – ${scope.user.name.split(' ')[0]}` : ''}`} subtitle={`${scope.mine ? (scope.isExec ? `Your dealers · ${(scope.user.regions || []).join(' & ')}` : 'Your accounts') : 'All regions'} · ${fmtDate(today())}`}
        actions={<><ScopeToggle scope={scope} /><Button variant="secondary" icon={ListTodo} onClick={() => setNewTask(true)}>New task</Button><Button icon={Plus} onClick={() => setNewOrder(true)}>New sales order</Button></>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Revenue MTD vs target" value={fmtCompact(d.mtd)} sub={d.target ? `${pct.toFixed(0)}% of ${fmtCompact(d.target)}` : 'No target set'} trend={growth} icon={Target} tone={pct >= 100 ? 'green' : 'brand'} onClick={() => navigate('/erp/sales/targets')} />
        <Stat label="Awaiting advance payment" value={fmtINR(sum(d.awaiting, (o) => o.total - (o.paidAmount || 0)))} sub={`${d.awaiting.length} orders · ${d.review.length} portal orders to review`} icon={Receipt} tone="amber" onClick={() => navigate('/erp/sales/orders?tab=CONFIRMED')} />
        <Stat label="Paid – ready to invoice" value={fmtINR(sum(d.ready, (o) => o.total))} sub={`${d.ready.length} orders with Dispatch`} icon={FileCheck2} tone="green" onClick={() => navigate('/erp/sales/orders?tab=PAID')} />
        <Stat label="Book stock value" value={fmtCompact(d.bookValue)} sub="paid, not yet dispatched (at landed cost)" icon={Boxes} tone="violet" />
      </Grid>
      {d.target > 0 && <Card className="mb-4"><div className="flex items-center gap-4 text-sm"><span className="text-slate-500 whitespace-nowrap">Month progress</span><Progress className="flex-1" value={d.mtd} max={d.target} tone={pct >= 100 ? 'green' : pct >= 70 ? 'brand' : 'amber'} showLabel /><span className="text-xs text-slate-500 whitespace-nowrap hidden sm:inline">{fmtINR(Math.max(0, d.target - d.mtd))} to go</span></div></Card>}

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Revenue trend – 12 months" subtitle="Invoiced taxable value" className="lg:col-span-2"><TrendChart data={d.trend} series={[{ key: 'revenue', label: 'Revenue' }]} height={250} /></Card>
        <Card title={scope.mine ? "My tasks today" : "Team tasks due"} subtitle={`${d.myTasks.length} due or overdue`} actions={<Link to="/erp/sales/tasks" className="text-xs text-brand-600 hover:underline">All tasks</Link>}>
          {d.myTasks.length ? (
            <ul className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {d.myTasks.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-start gap-2 border border-slate-100 rounded-lg p-2">
                  <button title="Mark done" onClick={() => done(t)} className="mt-0.5 text-slate-300 hover:text-emerald-600"><CheckCircle2 className="w-5 h-5" /></button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 leading-snug">{t.title}</div>
                    <div className="text-[11px] text-slate-500 flex gap-1.5 flex-wrap items-center">{taskTypeLabel(t.type)}<span>·</span><span className={cx(t.dueDate < today() && 'text-red-600 font-medium')}>{t.dueDate < today() ? `Overdue ${daysBetween(t.dueDate, today())}d` : 'Today'}</span>{t.priority === 'HIGH' && <Badge tone="red">High</Badge>}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CheckCircle2} title="All caught up" message="No tasks due today." />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Stock availability lookup" subtitle="In hand vs book stock vs incoming – products & spares" className="lg:col-span-1">
          <div className="space-y-3">
            <div className="relative"><Combobox options={state.products.map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: p.category }))} value={lookup} onChange={setLookup} placeholder="Search product or spare…" /></div>
            <StockLookupResult productId={lookup} />
          </div>
        </Card>
        <Card title="Container ETAs" subtitle="Promise delivery dates with confidence" actions={<Ship className="w-4 h-4 text-sky-600" />}>
          <ul className="space-y-3">
            {d.ships.map((s) => {
              const pos = state.purchaseOrders.filter((p) => s.poIds.includes(p.id))
              const items = pos.flatMap((p) => p.lines)
              const days = daysBetween(today(), s.eta)
              return (
                <li key={s.id} className="border border-slate-100 rounded-lg p-2.5">
                  <div className="flex justify-between gap-2 items-center"><span className="font-mono text-xs font-semibold">{s.number}</span><StatusBadge status={s.status} /></div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.containerNo} · ETA <b className="text-slate-700">{fmtDate(s.eta)}</b> {days >= 0 ? `(${days}d)` : '(arrived, clearing)'}</div>
                  <div className="text-[11px] text-slate-600 mt-1 line-clamp-2">{items.map((l) => `${state.products.find((p) => p.id === l.productId)?.shortName} ×${fmtNum(l.qty)}`).join(' · ')}</div>
                  <div className="text-[11px] text-emerald-700 mt-1">Sellable approx. {fmtDate(new Date(new Date(s.eta).getTime() + 6 * 864e5).toISOString().slice(0, 10))} (clearance + inward)</div>
                </li>
              )
            })}
            {d.ships.length === 0 && <li className="text-sm text-slate-400">No containers in transit.</li>}
          </ul>
        </Card>
        <Card title="Reorder nudges" subtitle="Dealers due to reorder or low on stock" actions={<Link to="/erp/sales/nudges" className="text-xs text-brand-600 hover:underline">Open</Link>}>
          {d.nudges.length ? (
            <ul className="divide-y divide-slate-100">
              {d.nudges.slice(0, 6).map((n) => (
                <li key={n.partnerId} className="py-2 flex items-start gap-2">
                  <Lightbulb className={cx('w-4 h-4 mt-0.5 shrink-0', n.lowStock.length ? 'text-red-500' : 'text-amber-500')} />
                  <div className="min-w-0 flex-1"><Link to={`/erp/sales/dealers/${n.partnerId}`} className="text-sm font-medium text-slate-800 hover:underline">{state.partners.find((p) => p.id === n.partnerId)?.name}</Link><div className="text-[11px] text-slate-500">{n.reason}</div></div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No pending nudges" />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Top dealers – last 90 days" className="lg:col-span-1" actions={<Link to="/erp/sales/reports" className="text-xs text-brand-600 hover:underline">Reports</Link>}>
          <ul className="space-y-2.5">
            {d.top.map(([pid, v], i) => (
              <li key={pid}>
                <div className="flex items-center justify-between gap-2"><Link to={`/erp/sales/dealers/${pid}`} className="min-w-0 hover:underline"><PartnerCell id={pid} /></Link><span className="text-sm tabular-nums font-medium">{fmtCompact(v)}</span></div>
                <Progress className="mt-1" value={v} max={d.top[0][1]} tone={i === 0 ? 'brand' : 'ink'} />
              </li>
            ))}
            {d.top.length === 0 && <li className="text-sm text-slate-400">No invoiced sales in this view.</li>}
          </ul>
        </Card>
        <Card title="Fast / Medium / Slow movers" subtitle="Units sold, last 90 days">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[['F', 'Fast', 'bg-emerald-50 text-emerald-700'], ['M', 'Medium', 'bg-amber-50 text-amber-800'], ['S', 'Slow', 'bg-slate-100 text-slate-700']].map(([k, l, c]) => <div key={k} className={cx('rounded-lg p-2 text-center', c)}><div className="text-xl font-bold">{d.fmsCount[k]}</div><div className="text-[11px]">{l}</div></div>)}
          </div>
          <div className="text-xs font-semibold text-slate-500 mb-1">Top fast movers</div>
          <ul className="space-y-1.5">
            {state.products.filter((p) => d.fms[p.id]?.cls === 'F').sort((a, b) => d.fms[b.id].qty - d.fms[a.id].qty).slice(0, 5).map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><ProductCell product={p} size="xs" /><span className="text-xs tabular-nums text-slate-500 whitespace-nowrap">{fmtNum(d.fms[p.id].perMonth)}/mo</span></li>)}
          </ul>
        </Card>
        <Card title="Stock alerts for Sales" subtitle="Fast movers below reorder level – sell with care">
          {d.fastLow.length ? <ul className="divide-y divide-slate-100">{d.fastLow.map((p) => <li key={p.id} className="py-2 flex items-center justify-between gap-2"><button className="text-left min-w-0" onClick={() => setLookup(p.id)}><ProductCell product={p} size="xs" /></button><div className="text-right text-xs whitespace-nowrap"><FMSBadge cls="F" /><div className="text-red-600 mt-0.5">{fmtNum(state.stock['WH-STAREX']?.[p.id] || 0)} / {fmtNum(p.reorderLevel)}</div></div></li>)}</ul> : <EmptyState title="All fast movers healthy" />}
          <Button variant="link" size="sm" className="mt-2" iconRight={ArrowRight} onClick={() => navigate('/erp/inventory/stock')}>Full stock view</Button>
        </Card>
      </div>
      {newOrder && <NewOrderModal open onClose={() => setNewOrder(false)} scope={scope} />}
      {newTask && <TaskModal open onClose={() => setNewTask(false)} />}
    </div>
  )
}
