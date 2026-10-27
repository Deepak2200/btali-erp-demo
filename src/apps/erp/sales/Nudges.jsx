import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb, Mail, ListTodo, CheckCircle2, ShoppingCart, PackageX, Zap, TrendingUp, Clock } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Tabs, Button, Badge, Progress, toast, prompt, EmptyState, SearchInput, Select } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PartnerCell, ProductCell, UserName } from '../../../components/business'
import { dealerNudges } from '../../../lib/analytics'
import { fmtDate, fmtCompact, fmtPct, daysAgo, sum, nowISO, timeAgo, addDays } from '../../../lib/format'
import { useScope, ScopeToggle, TaskModal, NewOrderModal, dealerStats } from './_shared'

const ACTION_LABEL = { EMAIL: 'Reminder emailed', TASK: 'Follow-up task', ACTIONED: 'Actioned', ORDERED: 'Converted to order' }
const ACTION_TONE = { EMAIL: 'blue', TASK: 'violet', ACTIONED: 'green', ORDERED: 'teal' }

export default function Nudges() {
  const state = useStore()
  const scope = useScope()
  const actionNudge = useStore((s) => s.actionNudge)
  const sendReorderReminder = useStore((s) => s.sendReorderReminder)
  const [tab, setTab] = useState('open')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [taskFor, setTaskFor] = useState(null)
  const [orderFor, setOrderFor] = useState(null)
  const actions = state.nudgeActions || []

  const nudges = useMemo(() => dealerNudges(state).filter((n) => scope.inScope(n.partnerId)), [state, scope.mine]) // eslint-disable-line
  const lastAction = (pid) => actions.filter((a) => a.partnerId === pid).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))[0]
  const recentCut = daysAgo(7)
  const enriched = nudges.map((n) => {
    const p = state.partners.find((x) => x.id === n.partnerId)
    const la = lastAction(n.partnerId)
    return { ...n, id: n.partnerId, partner: p, name: p?.name, lastAction: la, actioned: la && la.date >= recentCut, kind: n.lowStock.length ? 'STOCK' : 'FREQUENCY' }
  })
  const visible = enriched
    .filter((n) => !q || `${n.name} ${n.partner?.city}`.toLowerCase().includes(q.toLowerCase()))
    .filter((n) => !kind || n.kind === kind)
  const open = visible.filter((n) => !n.actioned)
  const done = visible.filter((n) => n.actioned)

  // KPIs (last 30 days)
  const cut30 = daysAgo(30)
  const acts30 = actions.filter((a) => a.date >= cut30 && scope.inScope(a.partnerId))
  const actedPartners = new Set(acts30.map((a) => a.partnerId))
  const generated = new Set([...enriched.map((n) => n.partnerId), ...actedPartners]).size
  const converted = [...actedPartners].filter((pid) => {
    const first = acts30.filter((a) => a.partnerId === pid).map((a) => a.date).sort()[0]
    return state.salesOrders.some((s) => s.partnerId === pid && s.date >= first && s.status !== 'CANCELLED') || acts30.some((a) => a.partnerId === pid && a.action === 'ORDERED')
  })
  const uplift = sum(state.salesOrders.filter((s) => converted.includes(s.partnerId) && s.date >= cut30 && s.status !== 'CANCELLED' && acts30.some((a) => a.partnerId === s.partnerId && a.date <= s.date && s.date <= addDays(a.date, 21))), (s) => s.subtotal)

  const remind = (n) => {
    sendReorderReminder(n.partnerId, n.lowStock)
    toast.success('Reminder emailed', `${n.name} · ${n.partner?.email}`)
  }
  const markActioned = async (n) => {
    const note = await prompt({ title: `Mark nudge actioned – ${n.name}`, label: 'What was done?', placeholder: 'e.g. Spoke to owner, order expected next week', required: true })
    if (!note) return
    actionNudge(n.partnerId, { action: 'ACTIONED', note, productIds: n.lowStock })
    toast.success('Nudge marked actioned')
  }
  const openTask = (n) => setTaskFor({ n, openedAt: nowISO() })
  const closeTask = () => {
    const { n, openedAt } = taskFor
    const created = (useStore.getState().tasks || []).find((t) => t.partnerId === n.partnerId && t.createdAt >= openedAt)
    if (created) actionNudge(n.partnerId, { action: 'TASK', note: created.title, productIds: n.lowStock })
    setTaskFor(null)
  }
  const openOrder = (n) => {
    const p = n.partner
    const lines = n.lowStock.length
      ? n.lowStock.map((pid) => ({ productId: pid, qty: Math.max(1, ((p.stockMin?.[pid] ?? 3) * 3) - (p.stock?.[pid] || 0)) }))
      : (() => {
          const last = state.salesOrders.filter((s) => s.partnerId === n.partnerId && s.status !== 'CANCELLED').sort((a, b) => b.date.localeCompare(a.date))[0]
          return last ? last.lines.filter((l) => !l.free).map((l) => ({ productId: l.productId, qty: l.qty })) : [{ productId: '', qty: 1 }]
        })()
    setOrderFor({ partnerId: n.partnerId, lines, title: `Reorder for ${n.name}`, note: 'Reorder raised from Sales nudge' })
  }

  const NudgeCard = ({ n }) => {
    const st = dealerStats(state, n.partnerId)
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/erp/sales/dealers/${n.partnerId}`} className="min-w-0 hover:underline"><PartnerCell id={n.partnerId} /></Link>
          {n.kind === 'STOCK' ? <Badge tone="red">Low dealer stock</Badge> : <Badge tone="amber">Reorder due</Badge>}
        </div>
        <div className="text-sm text-slate-700">{n.reason}</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] text-slate-500">Avg gap</div><div className="text-sm font-semibold">{n.avgGap}d</div></div>
          <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] text-slate-500">Since last</div><div className={`text-sm font-semibold ${n.since > n.avgGap ? 'text-red-600' : ''}`}>{n.since}d</div></div>
          <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] text-slate-500">12m revenue</div><div className="text-sm font-semibold">{fmtCompact(st.rev12)}</div></div>
        </div>
        <div><div className="flex justify-between text-[11px] text-slate-500 mb-1"><span>Reorder urgency</span><span>{fmtPct(Math.min(n.score, 2) * 50, 0)}</span></div><Progress value={Math.min(n.score, 2) * 50} tone={n.score >= 1.3 ? 'red' : n.score >= 1 ? 'amber' : 'green'} /></div>
        {n.lowStock.length > 0 && (
          <div className="space-y-1.5">
            {n.lowStock.slice(0, 3).map((pid) => (
              <div key={pid} className="flex items-center justify-between gap-2"><ProductCell id={pid} size="xs" /><span className="text-xs tabular-nums text-red-600 whitespace-nowrap">{n.partner?.stock?.[pid] ?? 0} / min {n.partner?.stockMin?.[pid] ?? 3}</span></div>
            ))}
            {n.lowStock.length > 3 && <div className="text-[11px] text-slate-500">+{n.lowStock.length - 3} more items · stock reported {fmtDate(n.partner?.stockUpdatedAt)}</div>}
          </div>
        )}
        {n.lastAction && <div className="text-[11px] text-slate-500">Last action: {ACTION_LABEL[n.lastAction.action]} · {timeAgo(n.lastAction.ts)} · <UserName id={n.lastAction.by} /></div>}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100 mt-auto">
          <Button size="sm" variant="soft" icon={ListTodo} onClick={() => openTask(n)}>Task</Button>
          <Button size="sm" variant="secondary" icon={Mail} onClick={() => remind(n)}>Email</Button>
          <Button size="sm" variant="secondary" icon={ShoppingCart} onClick={() => openOrder(n)}>Order</Button>
          <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => markActioned(n)}>Done</Button>
        </div>
      </div>
    )
  }

  const logRows = actions.filter((a) => scope.inScope(a.partnerId)).map((a) => ({ ...a, name: state.partners.find((p) => p.id === a.partnerId)?.name }))
  const list = tab === 'open' ? open : done

  return (
    <div>
      <PageHeader title="Reorder Nudges" subtitle="Dealers due to reorder based on consumption frequency and time-between-orders, plus dealers whose self-reported stock is below their minimum."
        actions={<ScopeToggle scope={scope} />} />
      <Grid cols={4} className="mb-4">
        <Stat label="Nudges generated (30d)" value={generated} icon={Lightbulb} tone="amber" sub={`${open.length} open now`} />
        <Stat label="Actioned (30d)" value={actedPartners.size} icon={Zap} tone="blue" sub={generated ? `${fmtPct((actedPartners.size / generated) * 100, 0)} action rate` : '—'} />
        <Stat label="Converted to orders" value={converted.length} icon={ShoppingCart} tone="green" sub={actedPartners.size ? `${fmtPct((converted.length / actedPartners.size) * 100, 0)} of actioned` : '—'} />
        <Stat label="Uplift from nudges" value={fmtCompact(uplift)} icon={TrendingUp} tone="brand" sub="Orders within 21 days of action" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { key: 'open', label: 'Open nudges', count: open.length },
        { key: 'done', label: 'Actioned this week', count: done.length },
        { key: 'log', label: 'Action log', count: logRows.length },
      ]} />
      {tab !== 'log' && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search dealer or city…" className="sm:max-w-xs w-full" />
          <div className="sm:w-56"><Select value={kind} onChange={(e) => setKind(e.target.value)} placeholder="All nudge types" options={[{ value: 'FREQUENCY', label: 'Reorder frequency' }, { value: 'STOCK', label: 'Low dealer stock' }]} /></div>
        </div>
      )}
      {tab === 'log' ? (
        <DataTable rows={logRows} exportName="nudge-actions" initialSort={{ key: 'ts', dir: 'desc' }} columns={[
          { key: 'ts', header: 'When', render: (r) => <span className="text-xs">{fmtDate(r.date)}</span> },
          { key: 'name', header: 'Dealer', render: (r) => <PartnerCell id={r.partnerId} /> },
          { key: 'action', header: 'Action', render: (r) => <Badge tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action] || r.action}</Badge> },
          { key: 'note', header: 'Note', className: 'max-w-xs truncate' },
          { key: 'by', header: 'By', value: (r) => state.users.find((u) => u.id === r.by)?.name },
        ]} />
      ) : list.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{list.map((n) => <NudgeCard key={n.partnerId} n={n} />)}</div>
      ) : (
        <Card><EmptyState icon={tab === 'open' ? CheckCircle2 : Clock} title={tab === 'open' ? 'All nudges actioned' : 'Nothing actioned this week'} message={tab === 'open' ? 'Every dealer due for a reorder has been contacted in the last 7 days.' : 'Use Task, Email or Done on an open nudge to action it.'} /></Card>
      )}
      {taskFor && <TaskModal open onClose={closeTask} initial={{ title: `Reorder follow-up – ${taskFor.n.name}`, type: 'FOLLOW_UP', partnerId: taskFor.n.partnerId, priority: taskFor.n.score >= 1.3 || taskFor.n.lowStock.length ? 'HIGH' : 'MEDIUM', notes: taskFor.n.reason, dueDate: addDays(daysAgo(0), 1) }} />}
      {orderFor && <NewOrderModal open onClose={() => setOrderFor(null)} initial={orderFor} scope={scope} />}
    </div>
  )
}
