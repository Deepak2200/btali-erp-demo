import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ShoppingCart, Ship, Package, Truck, Receipt, Wallet, HandCoins, CalendarDays, Users, Coins, Ticket, ShieldAlert, Clock,
  TrendingUp, Boxes, CheckSquare, ArrowRight, Brain, FileText, Target, Bell, Activity, Gauge, Store, Landmark, Send,
} from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { PageHeader, Card, Grid, Stat, Badge, Button, EmptyState, cx, Avatar } from '../../../components/ui'
import { TrendChart } from '../../../components/business'
import { fmtINR, fmtCompact, fmtNum, timeAgo, today, sum, daysBetween, fmtDate, monthKey } from '../../../lib/format'
import { pendingApprovals } from '../../../lib/approvals'
import { monthlySeries } from '../../../lib/analytics'
import { onHand, stockValue } from '../../../lib/stock'
import { ROLE_LABEL, canSeeModule } from '../../../nav'
import { computeAlerts, alertsForUser, receivablesAgeing } from './_alerts'

const SEV = { critical: 'red', warning: 'amber', info: 'blue' }

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function useRoleKpis(state, user) {
  return useMemo(() => {
    if (!user) return { tiles: [], links: [] }
    const t = today()
    const mk = monthKey(t)
    const role = user.role
    const reorder = state.products.filter((p) => p.active && onHand(state, p.id) < p.reorderLevel)
    const pos = state.purchaseOrders
    const shipments = state.shipments || []
    const inTransit = shipments.filter((s) => s.status !== 'RECEIVED')
    const myPartners = role === 'SALES_EXEC' ? new Set(state.partners.filter((p) => p.salespersonId === user.id).map((p) => p.id)) : null
    const sos = state.salesOrders.filter((s) => !myPartners || myPartners.has(s.partnerId))
    const invs = state.invoices.filter((i) => !myPartners || myPartners.has(i.partnerId))
    const salesMTD = sum(invs.filter((i) => monthKey(i.date) === mk && i.type !== 'FOC'), (i) => i.subtotal)
    const openSO = sos.filter((s) => ['CONFIRMED', 'PENDING_REVIEW', 'PAID', 'INVOICED'].includes(s.status))
    const readyToInvoice = state.salesOrders.filter((s) => s.status === 'PAID' && !s.invoiceId)
    const lrPending = state.invoices.filter((i) => i.status === 'ISSUED')
    const dispatchedToday = state.invoices.filter((i) => i.lr?.date === t)
    const awaitingAdvance = state.salesOrders.filter((s) => s.status === 'CONFIRMED' && s.paymentStatus !== 'PAID')
    const recv = receivablesAgeing(state)
    const receiptsMTD = sum((state.receipts || []).filter((r) => monthKey(r.date) === mk), (r) => r.amount)
    const bills = state.vendorBills || []
    const billsDue = bills.filter((b) => b.status !== 'PAID' && b.status !== 'REJECTED' && b.dueDate && daysBetween(t, b.dueDate) <= 7)
    const tickets = state.tickets || []
    const openTickets = tickets.filter((x) => !['RESOLVED', 'CLOSED'].includes(x.stage))
    const slaBreached = openTickets.filter((x) => (Date.now() - new Date(x.createdAt)) / 36e5 > (x.slaHours || 72))
    const claims = (state.warrantyClaims || []).filter((c) => ['SUBMITTED', 'UNDER_REVIEW'].includes(c.status))
    const targets = (state.targets || []).filter((x) => x.period === mk && (role === 'SALES_EXEC' ? x.ownerType === 'SALESPERSON' && x.ownerId === user.id : x.ownerType === 'SALESPERSON'))
    const targetAmt = sum(targets, (x) => x.amount)

    const T = {
      reorder: { label: 'Reorder breaches', value: fmtNum(reorder.length), sub: 'items below threshold', icon: AlertTriangle, tone: reorder.length ? 'red' : 'green', to: '/erp/purchase/reorder' },
      poPending: { label: 'POs awaiting approval', value: fmtNum(pos.filter((p) => p.status === 'PENDING_APPROVAL').length), sub: `${pos.filter((p) => p.pi?.status === 'PENDING').length} PI pending`, icon: ShoppingCart, tone: 'amber', to: '/erp/purchase/orders' },
      inProd: { label: 'In production / QC', value: fmtNum(pos.filter((p) => ['IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP'].includes(p.status)).length), sub: 'open vendor orders', icon: Package, tone: 'blue', to: '/erp/purchase/orders' },
      transit: { label: 'Containers inbound', value: fmtNum(inTransit.length), sub: `${inTransit.filter((s) => s.eta && s.eta < t).length} past ETA`, icon: Ship, tone: 'ink', to: '/erp/purchase/shipments' },
      salesMTD: { label: 'Sales this month', value: fmtCompact(salesMTD), sub: 'invoiced, ex-GST', icon: TrendingUp, tone: 'green', to: '/erp/sales/reports' },
      openSO: { label: 'Open sales orders', value: fmtNum(openSO.length), sub: fmtCompact(sum(openSO, (s) => s.total)), icon: ShoppingCart, tone: 'brand', to: '/erp/sales/orders' },
      review: { label: 'Portal orders to review', value: fmtNum(sos.filter((s) => s.status === 'PENDING_REVIEW').length), sub: 'from dealer portal', icon: CheckSquare, tone: 'amber', to: '/erp/sales/orders' },
      target: { label: 'Target achievement', value: targetAmt ? `${Math.round((salesMTD / targetAmt) * 100)}%` : '—', sub: targetAmt ? `of ${fmtCompact(targetAmt)} this month` : 'no target set', icon: Target, tone: 'violet', to: '/erp/sales/targets' },
      ready: { label: 'Ready to invoice', value: fmtNum(readyToInvoice.length), sub: fmtCompact(sum(readyToInvoice, (s) => s.total)), icon: Receipt, tone: 'brand', to: '/erp/dispatch/invoices' },
      lr: { label: 'LR pending', value: fmtNum(lrPending.length), sub: 'invoiced, not dispatched', icon: Truck, tone: lrPending.length ? 'amber' : 'green', to: '/erp/dispatch/lr' },
      dispToday: { label: 'Dispatched today', value: fmtNum(dispatchedToday.length), sub: 'LR uploaded', icon: Send, tone: 'green', to: '/erp/dispatch/schedule' },
      safex: { label: 'Safex consignments', value: fmtNum(lrPending.filter((i) => i.safex).length), sub: 'awaiting pickup', icon: Truck, tone: 'violet', to: '/erp/dispatch/special' },
      recv: { label: 'Receivables', value: fmtCompact(recv.total), sub: `${fmtCompact(recv.buckets['61-90'] + recv.buckets['90+'])} over 60 days`, icon: HandCoins, tone: 'amber', to: '/erp/accounts/receipts' },
      advance: { label: 'Advance awaited', value: fmtNum(awaitingAdvance.length), sub: fmtCompact(sum(awaitingAdvance, (s) => s.total - (s.paidAmount || 0))), icon: Wallet, tone: 'brand', to: '/erp/accounts/receipts' },
      receipts: { label: 'Receipts this month', value: fmtCompact(receiptsMTD), sub: `${(state.receipts || []).filter((r) => monthKey(r.date) === mk).length} entries`, icon: Coins, tone: 'green', to: '/erp/accounts/receipts' },
      billsDue: { label: 'Supplier dues (7 days)', value: bills.length ? fmtCompact(sum(billsDue, (b) => b.amountINR ?? b.amount)) : '—', sub: `${billsDue.length} bills`, icon: Landmark, tone: 'red', to: '/erp/accounts/payments' },
      leaves: { label: 'Leave requests', value: fmtNum((state.leaves || []).filter((l) => l.status === 'PENDING').length), sub: 'pending approval', icon: CalendarDays, tone: 'amber', to: '/erp/hr/leaves' },
      emps: { label: 'Employees', value: fmtNum((state.employees || []).length), sub: 'on payroll', icon: Users, tone: 'ink', to: '/erp/hr/employees' },
      payroll: { label: 'Payroll runs', value: fmtNum((state.payrollRuns || []).filter((p) => p.status !== 'PAID').length), sub: 'open / awaiting approval', icon: Coins, tone: 'brand', to: '/erp/hr/payroll' },
      empClaims: { label: 'Reimbursements', value: fmtNum((state.empClaims || []).filter((c) => c.status === 'PENDING').length), sub: 'pending', icon: Receipt, tone: 'violet', to: '/erp/hr/claims' },
      tickets: { label: 'Open tickets', value: fmtNum(openTickets.length), sub: `${openTickets.filter((x) => x.priority === 'HIGH').length} high priority`, icon: Ticket, tone: 'brand', to: '/erp/service/tickets' },
      sla: { label: 'SLA breached', value: fmtNum(slaBreached.length), sub: 'past response window', icon: Clock, tone: slaBreached.length ? 'red' : 'green', to: '/erp/service/tickets' },
      wclaims: { label: 'Warranty claims', value: fmtNum(claims.length), sub: 'awaiting decision', icon: ShieldAlert, tone: 'amber', to: '/erp/service/claims' },
      esc: { label: 'Vendor escalations', value: fmtNum(openTickets.filter((x) => x.escalatedToVendor).length), sub: 'open with suppliers', icon: Package, tone: 'violet', to: '/erp/service/escalations' },
      stockVal: { label: 'Stock value (Starex)', value: fmtCompact(stockValue(state)), sub: 'at landed cost', icon: Boxes, tone: 'ink', to: '/erp/inventory/stock' },
    }
    const L = (label, to, icon) => ({ label, to, icon })
    const map = {
      ADMIN: [['salesMTD', 'recv', 'stockVal', 'reorder'], [L('Executive dashboard', '/erp/management', Gauge), L('AI procurement planner', '/erp/management/planner', Brain), L('Product profitability', '/erp/management/profitability', TrendingUp), L('Franchise network', '/erp/franchise', Store)]],
      FINANCE_HEAD: [['recv', 'billsDue', 'receipts', 'stockVal'], [L('Payment dashboard', '/erp/accounts/payments', Landmark), L('Executive dashboard', '/erp/management', Gauge), L('Loans & bank balances', '/erp/accounts/loans', Wallet), L('MIS reports', '/erp/accounts/reports', FileText)]],
      PURCHASE: [['reorder', 'poPending', 'inProd', 'transit'], [L('Reorder alerts', '/erp/purchase/reorder', AlertTriangle), L('AI procurement planner', '/erp/management/planner', Brain), L('Purchase orders', '/erp/purchase/orders', ShoppingCart), L('Shipments & ETA', '/erp/purchase/shipments', Ship)]],
      SALES_MANAGER: [['salesMTD', 'openSO', 'review', 'target'], [L('Sales orders', '/erp/sales/orders', ShoppingCart), L('Dealer 360', '/erp/sales/dealers', Users), L('Targets & incentives', '/erp/sales/targets', Target), L('Franchise network', '/erp/franchise', Store)]],
      SALES_EXEC: [['salesMTD', 'openSO', 'review', 'target'], [L('Sales orders', '/erp/sales/orders', ShoppingCart), L('Reorder nudges', '/erp/sales/nudges', Brain), L('My tasks', '/erp/sales/tasks', CheckSquare), L('Dealer 360', '/erp/sales/dealers', Users)]],
      DISPATCH: [['ready', 'lr', 'dispToday', 'safex'], [L('Sales invoices', '/erp/dispatch/invoices', Receipt), L('Dispatch & LR', '/erp/dispatch/lr', Truck), L('Daily schedule', '/erp/dispatch/schedule', CalendarDays), L('Starex reconciliation', '/erp/dispatch/reconciliation', FileText)]],
      ACCOUNTS: [['advance', 'recv', 'receipts', 'billsDue'], [L('Customer receipts', '/erp/accounts/receipts', HandCoins), L('Vendor bills', '/erp/accounts/vendor-bills', FileText), L('Payment dashboard', '/erp/accounts/payments', Landmark), L('Banking', '/erp/accounts/banking', Wallet)]],
      HR: [['leaves', 'emps', 'payroll', 'empClaims'], [L('Leave management', '/erp/hr/leaves', CalendarDays), L('Payroll', '/erp/hr/payroll', Coins), L('Attendance', '/erp/hr/attendance', Clock), L('Employees', '/erp/hr/employees', Users)]],
      SERVICE: [['tickets', 'sla', 'wclaims', 'esc'], [L('Ticket desk', '/erp/service/tickets', Ticket), L('Warranty claims', '/erp/service/claims', ShieldAlert), L('Warranty registry', '/erp/service/warranties', ShieldAlert), L('Vendor escalations', '/erp/service/escalations', Package)]],
    }
    const [keys, links] = map[role] || map.ADMIN
    return { tiles: keys.map((k) => T[k]), links }
  }, [state, user])
}

export default function Home() {
  const state = useStore()
  const user = useUser()
  const nav = useNavigate()
  const { tiles, links } = useRoleKpis(state, user)
  const approvals = useMemo(() => pendingApprovals(state, user), [state, user])
  const alerts = useMemo(() => alertsForUser(computeAlerts(state), user), [state, user])
  const series = useMemo(() => (['ADMIN', 'FINANCE_HEAD', 'SALES_MANAGER'].includes(user?.role) ? monthlySeries(state, 12) : null), [state, user])
  const activity = useMemo(() => {
    const users = Object.fromEntries(state.users.map((u) => [u.id, u]))
    const audit = (state.auditLog || []).slice(0, 12).map((a) => ({ id: a.id, ts: a.ts, text: `${a.action}${a.ref ? ` · ${a.ref}` : ''}`, who: users[a.userId]?.name || 'System', kind: a.entity }))
    const docs = []
    const show = (mod) => user?.role === 'ADMIN' || canSeeModule(user?.role, mod)
    if (show('sales') || show('accounts') || show('dispatch')) {
      state.salesOrders.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 4).forEach((s) => docs.push({ id: s.id, ts: s.timeline?.[s.timeline.length - 1]?.ts || s.date, text: `${s.number} · ${state.partners.find((p) => p.id === s.partnerId)?.name || ''} · ${fmtINR(s.total)}`, who: s.status.replace(/_/g, ' ').toLowerCase(), kind: 'Sales order', link: `/erp/sales/orders/${s.id}` }))
    }
    if (show('purchase') || show('purchase-view')) {
      state.purchaseOrders.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 4).forEach((p) => docs.push({ id: p.id, ts: p.timeline?.[p.timeline.length - 1]?.ts || p.date, text: `${p.number} · ${state.vendors.find((v) => v.id === p.vendorId)?.name || ''}`, who: p.status.replace(/_/g, ' ').toLowerCase(), kind: 'Purchase order', link: `/erp/purchase/orders/${p.id}` }))
    }
    if (show('service')) {
      (state.tickets || []).slice(0, 3).forEach((t) => docs.push({ id: t.id, ts: t.createdAt, text: `${t.number} · ${t.subject}`, who: t.stage.replace(/_/g, ' ').toLowerCase(), kind: 'Ticket', link: '/erp/service/tickets' }))
    }
    return { audit, docs: docs.sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 8) }
  }, [state, user])

  if (!user) return null
  const critical = alerts.filter((a) => a.severity === 'critical').length

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-brand-500/20 blur-2xl" />
        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size="lg" />
            <div>
              <div className="text-white/60 text-xs uppercase tracking-wider">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <h1 className="text-xl sm:text-2xl font-bold">{greeting()}, {user.name.split(' ')[0]}</h1>
              <div className="text-sm text-white/70">{user.title} · {ROLE_LABEL[user.role]}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => nav('/erp/approvals')} className="flex items-center gap-2 bg-white/10 hover:bg-white/15 rounded-xl px-3 py-2 text-sm"><CheckSquare className="w-4 h-4 text-brand-400" /><span className="font-semibold">{approvals.length}</span> approvals</button>
            <button onClick={() => nav('/erp/notifications')} className="flex items-center gap-2 bg-white/10 hover:bg-white/15 rounded-xl px-3 py-2 text-sm"><Bell className="w-4 h-4 text-amber-300" /><span className="font-semibold">{alerts.length}</span> live alerts{critical ? <Badge tone="red">{critical} critical</Badge> : null}</button>
          </div>
        </div>
      </div>

      <Grid cols={4}>
        {tiles.map((t) => <Stat key={t.label} label={t.label} value={t.value} sub={t.sub} icon={t.icon} tone={t.tone} onClick={() => nav(t.to)} />)}
      </Grid>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {links.map((l) => (
          <button key={l.to} onClick={() => nav(l.to)} className="group bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 text-left hover:border-brand-300 hover:shadow-sm transition">
            <span className="p-2 rounded-lg bg-brand-50 text-brand-600"><l.icon className="w-4 h-4" /></span>
            <span className="flex-1 text-sm font-medium text-slate-800">{l.label}</span>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500" />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Pending approvals" subtitle="Top 5 waiting for you" actions={<Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => nav('/erp/approvals')}>All approvals</Button>}>
          {approvals.length === 0 ? <EmptyState icon={CheckSquare} title="Nothing awaiting your approval" message="New requests will appear here the moment they are submitted." /> : (
            <ul className="divide-y divide-slate-100 -mx-1">
              {approvals.slice(0, 5).map((a) => (
                <li key={`${a.type}-${a.id}`} className="flex items-center gap-3 px-1 py-2.5 cursor-pointer hover:bg-slate-50 rounded-lg" onClick={() => nav(`/erp/approvals?type=${a.type}`)}>
                  <Badge tone="brand">{a.label}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 truncate">{a.title}</div>
                    <div className="text-[11px] text-slate-400">{a.date ? timeAgo(a.date) : ''}</div>
                  </div>
                  {a.amount ? <span className="text-sm font-semibold tabular-nums text-slate-700">{fmtCompact(a.amount)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Live alerts" subtitle="Computed from current data" actions={<Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => nav('/erp/notifications?tab=alerts')}>View all</Button>}>
          {alerts.length === 0 ? <EmptyState icon={Bell} title="No active alerts" /> : (
            <ul className="space-y-2">
              {alerts.slice(0, 6).map((a) => (
                <li key={a.id} onClick={() => nav(a.link)} className="flex gap-2.5 items-start cursor-pointer rounded-lg p-2 hover:bg-slate-50">
                  <span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500')} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{a.title}</div>
                    <div className="text-xs text-slate-500 line-clamp-1">{a.body}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {series && (
        <Card title="Revenue & margin – last 12 months" subtitle="Invoiced sales (ex-GST) vs gross margin at landed cost">
          <TrendChart data={series} series={[{ key: 'revenue', label: 'Revenue' }, { key: 'margin', label: 'Gross margin' }]} height={240} />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Recent documents">
          {activity.docs.length === 0 ? <EmptyState icon={FileText} title="No recent documents" /> : (
            <ul className="divide-y divide-slate-100">
              {activity.docs.map((d) => (
                <li key={d.kind + d.id} onClick={() => d.link && nav(d.link)} className="py-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded px-1">
                  <Badge tone={d.kind === 'Purchase order' ? 'ink' : d.kind === 'Ticket' ? 'violet' : 'brand'}>{d.kind}</Badge>
                  <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{d.text}</span>
                  <span className="text-[11px] text-slate-400 capitalize whitespace-nowrap hidden sm:block">{d.who}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Activity log" subtitle="Latest actions across the system">
          {activity.audit.length === 0 ? <EmptyState icon={Activity} title="No activity recorded yet" message="Approvals, documents and updates will be logged here as your team works." /> : (
            <ul className="space-y-2.5">
              {activity.audit.map((a) => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <Avatar name={a.who} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 truncate">{a.text}</div>
                    <div className="text-[11px] text-slate-400">{a.who} · {timeAgo(a.ts)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
