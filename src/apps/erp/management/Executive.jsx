import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IndianRupee, Percent, Wallet, Boxes, Truck, AlertTriangle, Download, Printer, Ship, ShoppingCart, PackageX, Timer, Landmark, HandCoins, FileWarning, ArrowRight, Users,
} from 'lucide-react'
import { useStore, useUser, useLookup } from '../../../store'
import { PageHeader, Card, Grid, Stat, Tabs, Segmented, Button, Badge, StatusBadge, Modal, EmptyState, Progress, cx, toast, KV, Alert } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { TrendChart, BarsChart, DonutChart, FMSBadge, ProductCell, PartnerCell, PrintArea, DocHeader } from '../../../components/business'
import { fmtINR, fmtCompact, fmtNum, fmtPct, fmtDate, sum, round2, today, addDays, daysBetween, exportCSV, monthLabel } from '../../../lib/format'
import { aggregate } from '../../../lib/analytics'
import { computeAlerts, alertsForUser, ALERT_KINDS } from '../common/_alerts'
import { PRESETS, periodFor, execKpis, orderShortfalls, shipmentImpact, cashCycle, dealerPerformance, monthlyFor, inventoryView, payablesView } from './_execData'
import { HBarList, MiniMetric, DealerDrawer, ShipmentDrawer, ShortfallDrawer, ProgressRow } from './_execParts'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sales', label: 'Sales' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'accounts', label: 'Accounts' },
]

export default function Executive() {
  const state = useStore()
  const user = useUser()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'overview'
  const [preset, setPreset] = useState('90D')
  const [dealer, setDealer] = useState(null)
  const [shipment, setShipment] = useState(null)
  const [shortOpen, setShortOpen] = useState(false)
  const [pack, setPack] = useState(false)
  const period = useMemo(() => periodFor(preset), [preset])

  const k = useMemo(() => execKpis(state, period), [state, period])
  const cc = useMemo(() => cashCycle(state, k, period), [state, k, period])
  const shortfalls = useMemo(() => orderShortfalls(state), [state])
  const ships = useMemo(() => shipmentImpact(state), [state])
  const dealers = useMemo(() => dealerPerformance(state, period), [state, period])
  const inv = useMemo(() => inventoryView(state), [state])
  const trend = useMemo(() => monthlyFor(state, 12), [state])
  const alerts = useMemo(() => alertsForUser(computeAlerts(state), user), [state, user])
  const ctx = { state, period, k, cc, shortfalls, ships, dealers, inv, trend, alerts, setDealer, setShipment, setShortOpen }

  const snapshot = () => [
    ['Period', `${fmtDate(period.from)} – ${fmtDate(period.to)}`],
    ['Revenue (net of GST)', k.revenue], ['Revenue – prior period', k.prevRevenue], ['Gross margin', k.margin], ['Gross margin %', k.marginPct],
    ['Stock value (landed)', round2(k.stockValue)], ['Receivables', round2(k.receivables)], [k.payablesSource === 'BILLS' ? 'Payables (vendor bills)' : 'Payables (import PO balances)', round2(k.payables)],
    ['Working capital', round2(k.workingCapital)], ['Bank balances', k.bank || ''], ['Stock cover (days)', k.coverDays], ['Avg SO to dispatch (days)', k.leadAvg],
    ['Dispatched within 3 days %', k.onTime3], ['DSO (days)', cc.dso], ['Supplier cash-to-stock (days)', cc.supplierLead], ['Cash conversion cycle (days)', cc.ccc],
    ['Delayed containers', ships.filter((s) => s.delay > 0).length], ['Open orders short of stock', shortfalls.length], ['Reorder breaches', inv.breaches.length],
    ['Critical alerts', alerts.filter((a) => a.severity === 'critical').length],
  ].map(([metric, value]) => ({ metric, value }))

  return (
    <div>
      <PageHeader
        title="Executive Dashboard"
        subtitle={`Live view across Sales, Purchase, Dispatch & Accounts · ${fmtDate(period.from)} – ${fmtDate(period.to)}`}
        actions={<>
          <Segmented size="sm" value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ key: p.key, label: p.label }))} />
          <Button variant="secondary" size="sm" icon={Download} onClick={() => { exportCSV(`Btali-Executive-KPIs-${today()}.csv`, snapshot(), [{ header: 'Metric', value: (r) => r.metric }, { header: 'Value', value: (r) => r.value }]); toast.success('KPI snapshot exported') }}>Export</Button>
          <Button variant="dark" size="sm" icon={Printer} onClick={() => setPack(true)}>Board pack</Button>
        </>}
      />
      <Tabs className="mb-5" tabs={TABS} value={tab} onChange={(t) => setSp(t === 'overview' ? {} : { tab: t }, { replace: true })} />
      {tab === 'overview' && <Overview {...ctx} />}
      {tab === 'sales' && <SalesTab {...ctx} />}
      {tab === 'purchase' && <PurchaseTab {...ctx} />}
      {tab === 'dispatch' && <DispatchTab {...ctx} />}
      {tab === 'accounts' && <AccountsTab {...ctx} />}

      {dealer && <DealerDrawer partnerId={dealer} period={period} onClose={() => setDealer(null)} />}
      {shipment && <ShipmentDrawer shipment={shipment} onClose={() => setShipment(null)} />}
      {shortOpen && <ShortfallDrawer rows={shortfalls} onClose={() => setShortOpen(false)} />}
      {pack && <BoardPack {...ctx} snapshot={snapshot()} onClose={() => setPack(false)} />}
    </div>
  )
}

// ------------------------------------------------------------------ OVERVIEW
function Overview({ period, k, cc, shortfalls, ships, dealers, inv, trend, alerts, setDealer, setShortOpen, state }) {
  const navigate = useNavigate()
  const delayed = ships.filter((s) => s.delay > 0)
  const atRisk = sum(shortfalls.filter((s) => s.status === 'DELAYED'), (s) => s.value)
  const cats = useMemo(() => aggregate(k.lines, (l) => l.category).sort((a, b) => b.revenue - a.revenue), [k])
  const alertCounts = Object.keys(ALERT_KINDS).map((key) => ({ key, label: ALERT_KINDS[key].label, n: alerts.filter((a) => a.kind === key).length, crit: alerts.filter((a) => a.kind === key && a.severity === 'critical').length })).filter((x) => x.n)
  return (
    <div className="space-y-4">
      <Grid cols={6}>
        <Stat icon={IndianRupee} label="Revenue" value={fmtCompact(k.revenue)} trend={k.revTrend} sub="vs prior" />
        <Stat icon={Percent} tone="green" label="Gross margin" value={fmtPct(k.marginPct)} sub={k.marginTrend != null ? `${k.marginTrend >= 0 ? '+' : ''}${k.marginTrend} pts` : fmtCompact(k.margin)} />
        <Stat icon={Wallet} tone="ink" label="Working capital" value={fmtCompact(k.workingCapital)} sub="stock + AR − AP" />
        <Stat icon={Boxes} tone="violet" label="Stock cover" value={`${k.coverDays} days`} sub={`${fmtCompact(k.stockValue)} stock`} />
        <Stat icon={Timer} tone="blue" label="SO → dispatch" value={`${k.leadAvg} d`} sub={`${fmtPct(k.onTime3, 0)} in 3 days`} />
        <Stat icon={AlertTriangle} tone="red" label="Critical alerts" value={alerts.filter((a) => a.severity === 'critical').length} sub={`of ${alerts.length} live`} onClick={() => navigate('/erp/notifications')} />
      </Grid>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Revenue & gross margin – last 12 months" subtitle="Invoiced sales, net of GST">
          <TrendChart data={trend} series={[{ key: 'revenue', label: 'Revenue' }, { key: 'margin', label: 'Gross margin', color: '#0d9488' }]} height={270} />
        </Card>
        <Card title="Risk radar" subtitle="Live alerts computed from current data" actions={<Button size="sm" variant="link" onClick={() => navigate('/erp/notifications')}>All alerts</Button>}>
          {!alertCounts.length && <EmptyState title="No open risks" message="Every alert rule is within limits." />}
          <ul className="divide-y divide-slate-100">
            {alertCounts.map((a) => (
              <li key={a.key} className="flex items-center justify-between py-2.5 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded" onClick={() => navigate(`/erp/notifications?kind=${a.key}`)}>
                <span className="text-sm text-slate-700">{a.label}</span>
                <span className="flex items-center gap-1.5">{a.crit > 0 && <Badge tone="red">{a.crit} critical</Badge>}<Badge tone="gray">{a.n}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Procurement → Sales" subtitle="Delayed containers holding up dealer orders">
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Delayed containers" value={delayed.length} tone={delayed.length ? 'red' : 'green'} hint={delayed.map((d) => d.number).join(', ') || 'All on schedule'} />
            <MiniMetric label="Orders short of stock" value={shortfalls.length} tone={shortfalls.length ? 'amber' : 'green'} hint={`${sum(shortfalls, (s) => s.orders.length)} order lines`} />
            <MiniMetric label="Value waiting on delayed stock" value={fmtCompact(atRisk)} tone={atRisk ? 'red' : undefined} />
            <MiniMetric label="Open order value short" value={fmtCompact(sum(shortfalls, (s) => s.value))} />
          </div>
          <Button size="sm" variant="soft" className="w-full mt-3" iconRight={ArrowRight} onClick={() => setShortOpen(true)}>See affected orders</Button>
        </Card>
        <Card title="Sales → Dispatch" subtitle={`Order confirmation to LR · ${period.label}`}>
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Confirm → invoice" value={`${k.confirmToInvoice} d`} />
            <MiniMetric label="Invoice → LR" value={`${k.invoiceToLr} d`} />
            <MiniMetric label="SO → dispatch" value={`${k.leadAvg} d`} />
            <MiniMetric label="Within 3 days" value={fmtPct(k.onTime3, 0)} tone={k.onTime3 >= 90 ? 'green' : 'amber'} hint={`${fmtNum(k.dispatchedCount)} dispatches`} />
          </div>
          <Button size="sm" variant="soft" className="w-full mt-3" iconRight={ArrowRight} onClick={() => navigate('/erp/management?tab=dispatch')}>Dispatch view</Button>
        </Card>
        <Card title="Dispatch → Accounts" subtitle="Supplier vs dealer cash cycle (days)">
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Supplier: PO → stock in" value={`${cc.supplierLead} d`} hint="advance locked till inward" />
            <MiniMetric label="Avg supplier credit" value={`${cc.creditDays} d`} />
            <MiniMetric label="Dealer: SO → payment" value={`${cc.dealerLag} d`} hint="advance-before-invoice" />
            <MiniMetric label="Cash conversion" value={`${cc.ccc} d`} hint={`DIO ${cc.dio} + DSO ${cc.dso} − DPO ${cc.creditDays}`} tone={cc.ccc > 90 ? 'amber' : undefined} />
          </div>
          <Button size="sm" variant="soft" className="w-full mt-3" iconRight={ArrowRight} onClick={() => navigate('/erp/management?tab=accounts')}>Accounts view</Button>
        </Card>
        <Card title="Working capital" subtitle="Outstanding exposure today">
          <KV label="Stock at landed cost" value={fmtINR(k.stockValue)} />
          <KV label="+ Dealer receivables" value={fmtINR(k.receivables)} />
          <KV label={k.payablesSource === 'BILLS' ? '− Vendor payables' : '− Import PO balances due'} value={fmtINR(k.payables)} />
          <div className="border-t border-slate-200 mt-1 pt-1"><KV label={<span className="font-semibold text-slate-800">Working capital</span>} value={<span className="text-brand-700">{fmtINR(k.workingCapital)}</span>} /></div>
          {k.bank > 0 && <KV label="Bank balances" value={fmtINR(k.bank)} />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Top 10 dealers" subtitle={`Revenue contribution · ${period.label} · click for drill-down`}>
          <HBarList items={dealers.filter((d) => d.revenue > 0).slice(0, 10).map((d) => ({ id: d.id, label: d.name, sub: d.city, value: d.revenue, extra: `${d.share}%` }))} onClick={(it) => setDealer(it.id)} />
        </Card>
        <Card title="Product margins by category" subtitle={`Landed cost vs realised price · ${period.label}`} actions={<Button size="sm" variant="link" onClick={() => navigate('/erp/management/profitability')}>Product detail</Button>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-slate-500"><tr><th className="text-left py-2">Category</th><th className="text-right">Revenue</th><th className="text-right">Margin</th><th className="text-right w-36">Margin %</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cats.map((c) => (
                  <tr key={c.key} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/erp/management/profitability?category=${encodeURIComponent(c.key)}`)}>
                    <td className="py-2 font-medium text-slate-800">{c.key}</td>
                    <td className="text-right tabular-nums">{fmtCompact(c.revenue)}</td>
                    <td className="text-right tabular-nums">{fmtCompact(c.margin)}</td>
                    <td className="text-right"><div className="flex items-center gap-2 justify-end"><div className="w-16"><Progress value={c.marginPct} max={60} tone={c.marginPct >= (state.settings.targetMarginPct || 12) ? 'green' : 'amber'} /></div><span className="tabular-nums w-12">{fmtPct(c.marginPct)}</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Fast / Medium / Slow movers" subtitle="Units sold, last 90 days">
          <DonutChart money={false} height={200} data={[{ name: 'Fast moving', value: inv.fmsCount.F }, { name: 'Medium moving', value: inv.fmsCount.M }, { name: 'Slow moving', value: inv.fmsCount.S }]} />
        </Card>
        <Card title="Stock cover by category" subtitle="Days of stock at current sell-through">
          {inv.cats.map((c) => <ProgressRow key={c.category} label={c.category} value={Math.min(c.cover || 0, 180)} max={180} right={c.cover != null ? `${c.cover} d` : '—'} tone={(c.cover || 0) < 30 ? 'red' : (c.cover || 0) > 120 ? 'amber' : 'green'} />)}
        </Card>
        <Card title="Reorder breaches" subtitle="Starex on-hand below reorder level" actions={<Button size="sm" variant="link" onClick={() => navigate('/erp/management/planner')}>AI planner</Button>}>
          <ul className="divide-y divide-slate-100">
            {inv.breaches.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 gap-2">
                <ProductCell product={p} sub={`${p.onHand} / ${p.reorderLevel}`} />
                <FMSBadge cls={p.fms} />
              </li>
            ))}
          </ul>
          {inv.breaches.length > 6 && <Button size="sm" variant="ghost" className="w-full mt-2" onClick={() => navigate('/erp/purchase/reorder')}>+{inv.breaches.length - 6} more</Button>}
          {!inv.breaches.length && <EmptyState title="No breaches" />}
        </Card>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ SALES
function SalesTab({ state, period, k, dealers, inv, setDealer }) {
  const navigate = useNavigate()
  const { user } = useLookup()
  const regions = useMemo(() => aggregate(k.lines, (l) => l.region).sort((a, b) => b.revenue - a.revenue).map((r) => ({ label: r.key, revenue: r.revenue, margin: r.margin })), [k])
  const cats = useMemo(() => aggregate(k.lines, (l) => l.category).sort((a, b) => b.revenue - a.revenue).map((r) => ({ name: r.key, value: r.revenue })), [k])
  const prods = useMemo(() => {
    const agg = Object.fromEntries(aggregate(k.lines, (l) => l.productId).map((r) => [r.key, r]))
    return inv.rows.map((p) => ({ ...p, qty: agg[p.id]?.qty || 0, revenue: agg[p.id]?.revenue || 0, marginPct: agg[p.id]?.marginPct || 0 })).sort((a, b) => b.revenue - a.revenue)
  }, [k, inv])
  const hasTargets = (state.targets || []).length > 0
  const spTargets = useMemo(() => {
    const ts = (state.targets || []).filter((t) => t.ownerType === 'SALESPERSON')
    if (!ts.length) return []
    const latest = ts.reduce((a, t) => (t.period > a ? t.period : a), '')
    return ts.filter((t) => t.period === latest).map((t) => {
      const end = addDays(`${t.period}-01`, 92)
      const ach = sum(state.invoices.filter((i) => i.date >= `${t.period}-01` && i.date < end && state.partners.find((p) => p.id === i.partnerId)?.salespersonId === t.ownerId), (i) => i.subtotal)
      return { ...t, achieved: ach, pct: t.amount ? round2((ach / t.amount) * 100) : 0 }
    })
  }, [state])
  const buying = dealers.filter((d) => d.revenue > 0).length
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat icon={IndianRupee} label="Revenue" value={fmtCompact(k.revenue)} trend={k.revTrend} sub={period.label} />
        <Stat icon={ShoppingCart} tone="ink" label="Invoices" value={fmtNum(new Set(k.lines.map((l) => l.invoiceId)).size)} sub={`avg ${fmtCompact(k.revenue / Math.max(1, new Set(k.lines.map((l) => l.invoiceId)).size))}`} />
        <Stat icon={Users} tone="green" label="Buying dealers" value={buying} sub={`of ${dealers.length} in network`} />
        <Stat icon={Percent} tone="violet" label="Gross margin" value={fmtPct(k.marginPct)} sub={fmtCompact(k.margin)} />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Region-wise sales" subtitle="Revenue and gross margin">
          <BarsChart data={regions} series={[{ key: 'revenue', label: 'Revenue' }, { key: 'margin', label: 'Gross margin', color: '#0d9488' }]} height={250} />
        </Card>
        <Card title="Category mix"><DonutChart data={cats} height={200} /></Card>
      </div>
      <DataTable
        exportName={`dealer-sales-${period.from}`}
        onRowClick={(r) => setDealer(r.id)}
        filters={[{ key: 'region', label: 'regions', options: [...new Set(dealers.map((d) => d.region))] }, { key: 'type', label: 'types', options: ['DEALER', 'FRANCHISE'] }]}
        initialSort={{ key: 'revenue', dir: 'desc' }}
        rows={dealers}
        columns={[
          { key: 'name', header: 'Dealer', render: (r) => <PartnerCell id={r.id} /> },
          { key: 'region', header: 'Region' },
          { key: 'salesperson', header: 'Salesperson', value: (r) => user(r.salespersonId)?.name || '—' },
          { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => fmtINR(r.revenue) },
          { key: 'share', header: 'Share', align: 'right', render: (r) => fmtPct(r.share) },
          { key: 'growth', header: 'Growth', align: 'right', render: (r) => (r.growth == null ? '—' : <span className={r.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}>{r.growth >= 0 ? '+' : ''}{fmtPct(r.growth)}</span>) },
          { key: 'marginPct', header: 'Margin %', align: 'right', render: (r) => fmtPct(r.marginPct) },
          { key: 'achievement', header: 'Target (month)', align: 'right', hidden: !hasTargets, render: (r) => (r.achievement == null ? '—' : <Badge tone={r.achievement >= 100 ? 'green' : r.achievement >= 80 ? 'amber' : 'red'}>{fmtPct(r.achievement, 0)}</Badge>) },
          { key: 'incentive', header: 'Incentive', align: 'right', hidden: !hasTargets, render: (r) => (r.incentive ? fmtINR(r.incentive) : '—') },
        ]}
      />
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3" title="Fast / slow moving products" subtitle={`Sales ${period.label} · F/M/S on 90-day units`}>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-slate-500 sticky top-0 bg-white"><tr><th className="text-left py-2">Product</th><th>Class</th><th className="text-right">Units</th><th className="text-right">Revenue</th><th className="text-right">Margin</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {prods.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/erp/management/demand?product=${p.id}`)}>
                    <td className="py-1.5"><ProductCell product={p} /></td>
                    <td className="text-center"><FMSBadge cls={p.fms} /></td>
                    <td className="text-right tabular-nums">{fmtNum(p.qty)}</td>
                    <td className="text-right tabular-nums">{fmtCompact(p.revenue)}</td>
                    <td className="text-right tabular-nums">{fmtPct(p.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="lg:col-span-2" title="Sales team – targets & incentives" subtitle={spTargets.length ? `Quarter starting ${monthLabel(spTargets[0].period)}` : 'Quarterly salesperson targets'} actions={<Button size="sm" variant="link" onClick={() => navigate('/erp/sales/targets')}>Manage targets</Button>}>
          {!spTargets.length && <EmptyState title="No salesperson targets set" message="Set quarterly targets in Sales → Targets & Incentives." />}
          {spTargets.map((t) => {
            const slab = [...(t.slabs || [])].sort((a, b) => a.achievePct - b.achievePct).filter((s) => t.pct >= s.achievePct).pop()
            return (
              <div key={t.id} className="py-2 border-b border-slate-100 last:border-0">
                <div className="flex justify-between text-sm mb-1"><span className="font-medium text-slate-800">{user(t.ownerId)?.name}</span><span className="tabular-nums text-slate-600">{fmtCompact(t.achieved)} / {fmtCompact(t.amount)}</span></div>
                <Progress value={t.pct} max={100} tone={t.pct >= 100 ? 'green' : t.pct >= 70 ? 'amber' : 'red'} showLabel />
                <div className="text-[11px] text-slate-500 mt-0.5">{slab ? `Incentive slab ${slab.incentivePct}% → ${fmtINR((t.achieved * slab.incentivePct) / 100)}` : `Next slab at ${(t.slabs || [])[0]?.achievePct || 90}% achievement`}</div>
              </div>
            )
          })}
        </Card>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ PURCHASE
function PurchaseTab({ state, period, ships, inv, setShipment }) {
  const navigate = useNavigate()
  const { vendor } = useLookup()
  const fx = state.settings.fx
  const openPOs = state.purchaseOrders.filter((p) => !['RECEIVED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(p.status))
  const openValue = sum(openPOs, (p) => sum(p.lines, (l) => l.qty * l.rate) * (fx[p.currency] || 1))
  const byVendor = useMemo(() => {
    const m = {}
    for (const p of state.purchaseOrders) {
      if (['REJECTED', 'CANCELLED', 'DRAFT'].includes(p.status) || p.date < addDays(today(), -365)) continue
      m[p.vendorId] = (m[p.vendorId] || 0) + sum(p.lines, (l) => l.qty * l.rate) * (fx[p.currency] || 1)
    }
    return Object.entries(m).map(([id, v]) => ({ id, label: vendor(id)?.name, sub: vendor(id)?.country, value: Math.round(v) })).sort((a, b) => b.value - a.value)
  }, [state.purchaseOrders]) // eslint-disable-line
  const pipeline = ['PENDING_APPROVAL', 'APPROVED', 'PI_RECEIVED', 'IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP', 'SHIPPED'].map((s) => ({ s, n: state.purchaseOrders.filter((p) => p.status === s).length }))
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat icon={ShoppingCart} label="Open purchase orders" value={openPOs.length} sub={fmtCompact(openValue)} onClick={() => navigate('/erp/purchase/orders')} />
        <Stat icon={Ship} tone="blue" label="Containers in pipeline" value={ships.length} sub={`${ships.filter((s) => s.status === 'IN_TRANSIT').length} on water`} />
        <Stat icon={AlertTriangle} tone="red" label="Delayed containers" value={ships.filter((s) => s.delay > 0).length} sub="ETA passed, not received" />
        <Stat icon={PackageX} tone="amber" label="Threshold breaches" value={inv.breaches.length} sub="below reorder level" onClick={() => navigate('/erp/purchase/reorder')} />
      </Grid>
      <Card title="Container arrival timeline" subtitle="Click a container for milestones and contents" padded={false}>
        {!ships.length && <EmptyState title="No containers in transit" />}
        <div className="divide-y divide-slate-100">
          {ships.map((s) => (
            <button key={s.id} onClick={() => setShipment(s)} className="w-full text-left px-4 py-3 hover:bg-slate-50 grid grid-cols-1 md:grid-cols-12 gap-2 md:items-center">
              <div className="md:col-span-3 min-w-0">
                <div className="text-sm font-semibold text-slate-800">{s.number}</div>
                <div className="text-[11px] text-slate-500 truncate">{s.containerNo} · {vendor(s.vendorId)?.name}</div>
              </div>
              <div className="md:col-span-2 text-sm"><div className="text-[11px] text-slate-400">ETA</div>{fmtDate(s.eta)}</div>
              <div className="md:col-span-4">
                <Progress value={s.progress} tone={s.delay > 0 ? 'red' : 'blue'} showLabel />
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">Next: {s.nextMilestone?.label || '—'}</div>
              </div>
              <div className="md:col-span-3 flex flex-wrap gap-1.5 md:justify-end">
                <StatusBadge status={s.status} />
                {s.delay > 0 ? <Badge tone="red">+{s.delay}d late</Badge> : <Badge tone="green">On schedule</Badge>}
                {s.blockedOrders > 0 && <Badge tone="amber">{s.blockedOrders} orders waiting</Badge>}
              </div>
            </button>
          ))}
        </div>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Vendor-wise procurement" subtitle="PO value (INR) – last 12 months">
          <HBarList items={byVendor} onClick={(it) => navigate(`/erp/purchase/orders?vendor=${it.id}`)} color="bg-ink-600" />
        </Card>
        <Card title="PO pipeline" subtitle="Open purchase orders by stage">
          {pipeline.map((p) => <ProgressRow key={p.s} label={p.s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} value={p.n} max={Math.max(1, ...pipeline.map((x) => x.n))} right={p.n} tone="ink" />)}
          <Button size="sm" variant="soft" className="w-full mt-3" iconRight={ArrowRight} onClick={() => navigate('/erp/purchase/orders')}>Purchase orders</Button>
        </Card>
      </div>
      <DataTable
        exportName="reorder-breaches"
        rows={inv.breaches}
        searchable={false}
        toolbar={<Button size="sm" variant="soft" onClick={() => navigate('/erp/management/planner')}>Plan with AI</Button>}
        columns={[
          { key: 'name', header: 'Product below reorder level', value: (r) => r.shortName, render: (r) => <ProductCell product={r} /> },
          { key: 'fms', header: 'Class', render: (r) => <FMSBadge cls={r.fms} /> },
          { key: 'onHand', header: 'On hand', align: 'right' },
          { key: 'reorderLevel', header: 'Reorder level', align: 'right' },
          { key: 'perMonth', header: 'Sells / month', align: 'right' },
          { key: 'cover', header: 'Cover', align: 'right', render: (r) => (r.cover == null ? '—' : <span className={r.cover < 30 ? 'text-red-600 font-medium' : ''}>{r.cover} d</span>) },
          { key: 'vendor', header: 'Vendor', value: (r) => vendor(r.vendorId)?.name },
        ]}
      />
    </div>
  )
}

// ------------------------------------------------------------------ DISPATCH
function DispatchTab({ state, period, k }) {
  const navigate = useNavigate()
  const { transporter, partner } = useLookup()
  const days = useMemo(() => {
    const out = []
    for (let i = 13; i >= 0; i--) {
      const d = addDays(today(), -i)
      out.push({ label: fmtDate(d).slice(0, 6), date: d, planned: state.invoices.filter((x) => x.dispatchDate === d).length, completed: state.invoices.filter((x) => x.lr?.date === d).length })
    }
    return out
  }, [state.invoices])
  const invs = state.invoices.filter((i) => i.date >= period.from && i.date <= period.to)
  const util = useMemo(() => {
    const m = {}
    for (const i of invs) {
      const r = (m[i.transporterId || '—'] = m[i.transporterId || '—'] || { id: i.transporterId || '—', count: 0, value: 0, freight: 0 })
      r.count++
      r.value += i.subtotal || 0
      r.freight += i.freightCost || 0
    }
    return Object.values(m).map((r) => ({ ...r, label: transporter(r.id)?.name || 'Self pickup', share: invs.length ? round2((r.count / invs.length) * 100) : 0 })).sort((a, b) => b.count - a.count)
  }, [invs]) // eslint-disable-line
  const pendingLR = state.invoices.filter((i) => i.status === 'ISSUED').map((i) => ({ ...i, age: daysBetween(i.date, today()) }))
  const readyToInvoice = state.salesOrders.filter((s) => s.status === 'PAID' && !s.invoiceId)
  const todayPlanned = days[days.length - 1]
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat icon={Truck} label="Dispatches" value={fmtNum(invs.filter((i) => i.lr).length)} sub={`${invs.length} invoices · ${period.label}`} />
        <Stat icon={FileWarning} tone="amber" label="LR pending" value={pendingLR.length} sub={`${pendingLR.filter((i) => i.age > 2).length} older than 2 days`} onClick={() => navigate('/erp/dispatch/lr')} />
        <Stat icon={HandCoins} tone="green" label="Ready to invoice" value={readyToInvoice.length} sub={fmtCompact(sum(readyToInvoice, (s) => s.total))} onClick={() => navigate('/erp/dispatch/invoices')} />
        <Stat icon={Timer} tone="blue" label="Invoice → LR" value={`${k.invoiceToLr} d`} sub={`today: ${todayPlanned.completed}/${todayPlanned.planned} done`} />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Daily dispatch – planned vs completed" subtitle="Last 14 days (planned dispatch date vs LR uploaded)">
          <BarsChart data={days} money={false} series={[{ key: 'planned', label: 'Planned', color: '#cbd5e1' }, { key: 'completed', label: 'Completed (LR)', color: '#0d9488' }]} height={250} />
        </Card>
        <Card title="Transporter utilisation" subtitle={`Share of dispatches · ${period.label}`}>
          <HBarList money={false} items={util.map((u) => ({ id: u.id, label: u.label, value: u.count, extra: `${u.share}%` }))} color="bg-ink-600" />
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="LR & invoice dispatch timeline" subtitle="Invoices awaiting LR upload" padded={false} actions={<Button size="sm" variant="link" onClick={() => navigate('/erp/dispatch/lr')}>Upload LR</Button>}>
          {!pendingLR.length && <EmptyState title="All invoices dispatched" />}
          <div className="divide-y divide-slate-100">
            {pendingLR.map((i) => (
              <div key={i.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-sm font-medium">{i.number}</div><div className="text-[11px] text-slate-500 truncate">{partner(i.partnerId)?.name} · {transporter(i.transporterId)?.name || '—'}</div></div>
                <div className="text-right shrink-0"><div className="text-xs text-slate-500">{fmtDate(i.date)}</div><Badge tone={i.age > 2 ? 'red' : i.age > 0 ? 'amber' : 'gray'}>{i.age === 0 ? 'today' : `${i.age}d waiting`}</Badge></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Paid orders ready for invoicing" padded={false} actions={<Button size="sm" variant="link" onClick={() => navigate('/erp/dispatch/invoices')}>Create invoices</Button>}>
          {!readyToInvoice.length && <EmptyState title="Nothing waiting" />}
          <div className="divide-y divide-slate-100">
            {readyToInvoice.map((s) => (
              <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/erp/sales/orders/${s.id}`)}>
                <div className="min-w-0"><div className="text-sm font-medium">{s.number}</div><div className="text-[11px] text-slate-500 truncate">{partner(s.partnerId)?.name}</div></div>
                <div className="text-right shrink-0 text-sm tabular-nums">{fmtINR(s.total)}<div className="text-[11px] text-slate-400">{daysBetween(s.date, today())}d since order</div></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ ACCOUNTS
function AccountsTab({ state, k, cc }) {
  const navigate = useNavigate()
  const { vendor, partner } = useLookup()
  const pay = k.pay
  const ageing = Object.entries(k.ageing).map(([label, value]) => ({ label: `${label} days`, value: Math.round(value) }))
  const outstanding = state.salesOrders.filter((so) => ['CONFIRMED', 'INVOICED', 'DISPATCHED', 'DELIVERED'].includes(so.status) && so.paymentStatus !== 'PAID' && so.total - (so.paidAmount || 0) > 0)
    .map((so) => ({ ...so, due: round2(so.total - (so.paidAmount || 0)), age: daysBetween(so.date, today()) })).sort((a, b) => b.age - a.age)
  const supplierRows = pay.source === 'BILLS'
    ? pay.bills.map((b) => ({ id: b.id, ref: b.number, vendorId: b.vendorId, amount: b.amountINR ?? b.amount, due: b.dueDate, status: b.status, category: b.category }))
    : pay.poCommit.map((x) => ({ id: x.po.id, ref: x.po.number, vendorId: x.po.vendorId, amount: Math.round(x.due), due: x.po.shipmentId ? state.shipments.find((s) => s.id === x.po.shipmentId)?.eta : null, status: x.po.status, category: 'SUPPLIER' }))
  const due30 = sum(supplierRows.filter((r) => !r.due || r.due <= addDays(today(), 30)), (r) => r.amount)
  const loans = state.loans || []
  const banks = state.bankAccounts || []
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat icon={HandCoins} label="Dealer receivables" value={fmtCompact(k.receivables)} sub={`DSO ${cc.dso} days`} onClick={() => navigate('/erp/accounts/receipts')} />
        <Stat icon={FileWarning} tone="amber" label={pay.source === 'BILLS' ? 'Supplier dues' : 'Import PO balances'} value={fmtCompact(k.payables)} sub={`${fmtCompact(due30)} due in 30 days`} onClick={() => navigate('/erp/accounts/payments')} />
        <Stat icon={Landmark} tone="green" label="Bank balances" value={banks.length ? fmtCompact(k.bank) : '—'} sub={banks.length ? `${banks.length} accounts` : 'Banking not yet set up'} onClick={() => navigate('/erp/accounts/banking')} />
        <Stat icon={Wallet} tone="ink" label="Working capital" value={fmtCompact(k.workingCapital)} sub={`CCC ${cc.ccc} days`} />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Receivables ageing" subtitle="Unpaid confirmed / invoiced orders">
          <BarsChart data={ageing} series={[{ key: 'value', label: 'Outstanding' }]} height={220} />
        </Card>
        <Card title="Payables vs bank balances" subtitle="Next 30 days">
          <BarsChart data={[{ label: 'Due ≤ 30 days', value: Math.round(due30) }, { label: 'All open dues', value: Math.round(k.payables) }, { label: 'Bank balance', value: Math.round(k.bank) }]} series={[{ key: 'value', label: 'Amount' }]} height={220} />
          {banks.length > 0 && k.bank < due30 && <Alert tone="warn" className="mt-2">Bank balance falls short of 30-day dues by {fmtINR(due30 - k.bank)}.</Alert>}
        </Card>
        <Card title="Loan repayment schedule" subtitle="Term loans & credit lines" actions={<Button size="sm" variant="link" onClick={() => navigate('/erp/accounts/loans')}>Loans</Button>}>
          {!loans.length && <EmptyState title="No loans recorded" message="Loans added in Accounts → Loans appear here with EMIs." />}
          {loans.slice(0, 5).map((l) => {
            const out = l.outstanding ?? l.balance ?? l.principal ?? 0
            const princ = l.principal ?? l.sanctioned ?? l.amount ?? out
            return <ProgressRow key={l.id} label={`${l.lender || l.bank || l.name || 'Loan'}${l.type ? ` · ${l.type}` : ''}`} value={princ - out} max={princ || 1} right={`${fmtCompact(out)} o/s${l.emi ? ` · EMI ${fmtCompact(l.emi)}` : ''}${l.nextDueDate || l.nextDue ? ` · ${fmtDate(l.nextDueDate || l.nextDue)}` : ''}`} tone="ink" />
          })}
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <DataTable
          exportName="supplier-dues"
          pageSize={8}
          rows={supplierRows}
          toolbar={<span className="text-xs text-slate-500">{pay.source === 'BILLS' ? 'Vendor bills awaiting payment' : 'Balance payable on open import POs'}</span>}
          searchable={false}
          initialSort={{ key: 'due', dir: 'asc' }}
          columns={[
            { key: 'ref', header: 'Reference', className: 'whitespace-nowrap' },
            { key: 'vendor', header: 'Supplier', value: (r) => vendor(r.vendorId)?.name },
            { key: 'due', header: 'Due', className: 'whitespace-nowrap', render: (r) => fmtDate(r.due) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => fmtINR(r.amount) },
          ]}
        />
        <DataTable
          exportName="receivables-ageing"
          pageSize={8}
          rows={outstanding}
          searchable={false}
          toolbar={<span className="text-xs text-slate-500">Dealer outstanding by age</span>}
          onRowClick={(r) => navigate(`/erp/sales/orders/${r.id}`)}
          columns={[
            { key: 'number', header: 'Order' },
            { key: 'partner', header: 'Dealer', value: (r) => partner(r.partnerId)?.name },
            { key: 'age', header: 'Age', align: 'right', render: (r) => <Badge tone={r.age > 60 ? 'red' : r.age > 30 ? 'amber' : 'gray'}>{r.age} d</Badge> },
            { key: 'due', header: 'Outstanding', align: 'right', render: (r) => fmtINR(r.due) },
          ]}
        />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ BOARD PACK (printable)
function BoardPack({ period, snapshot, dealers, ships, k, onClose }) {
  const cats = aggregate(k.lines, (l) => l.category).sort((a, b) => b.revenue - a.revenue)
  const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) > 999 ? fmtINR(v) : fmtNum(v)) : v)
  return (
    <Modal open onClose={onClose} size="lg" title="Management board pack" subtitle={`${fmtDate(period.from)} – ${fmtDate(period.to)}`}>
      <PrintArea title={`Btali Management Pack ${today()}`}>
        <DocHeader title="Management MIS" number={period.label} date={today()} />
        <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">Key performance indicators</h4>
        <table className="w-full text-sm mb-5"><tbody className="divide-y divide-slate-100">{snapshot.slice(1).map((r) => <tr key={r.metric}><td className="py-1 text-slate-600">{r.metric}</td><td className="py-1 text-right tabular-nums font-medium">{r.metric.includes('%') ? fmtPct(r.value) : fmt(r.value)}</td></tr>)}</tbody></table>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">Top 10 dealers</h4>
            <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">{dealers.slice(0, 10).map((d) => <tr key={d.id}><td className="py-1">{d.name}</td><td className="py-1 text-right tabular-nums">{fmtINR(d.revenue)}</td><td className="py-1 text-right text-slate-500">{fmtPct(d.share)}</td></tr>)}</tbody></table>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">Category margins</h4>
            <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">{cats.map((c) => <tr key={c.key}><td className="py-1">{c.key}</td><td className="py-1 text-right tabular-nums">{fmtINR(c.revenue)}</td><td className="py-1 text-right">{fmtPct(c.marginPct)}</td></tr>)}</tbody></table>
            <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2 mt-4">Containers in pipeline</h4>
            <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">{ships.map((s) => <tr key={s.id}><td className="py-1">{s.number}</td><td className="py-1">{fmtDate(s.eta)}</td><td className="py-1 text-right">{s.delay > 0 ? `${s.delay}d late` : 'On schedule'}</td></tr>)}</tbody></table>
          </div>
        </div>
      </PrintArea>
    </Modal>
  )
}
