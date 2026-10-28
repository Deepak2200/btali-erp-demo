import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Users, TrendingUp, TrendingDown, Award, Truck, IndianRupee, Container, Warehouse, Timer, ShieldCheck, Gift, Download } from 'lucide-react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Card, Grid, Stat, Tabs, Segmented, Select, Badge, Button, EmptyState, Alert, Progress, toast } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PartnerCell, BarsChart, CHART_COLORS } from '../../../components/business'
import { fmtINR, fmtCompact, fmtNum, fmtPct, fmtDate, sum, round2, today, daysBetween, lastMonths, monthLabel, exportCSV } from '../../../lib/format'
import { PRESETS, periodFor, dealerPerformance } from './_execData'
import { DealerDrawer, MiniMetric, HBarList } from './_execParts'

const TABS = [
  { key: 'dealers', label: 'Dealer performance' },
  { key: 'logistics', label: 'Logistics cost' },
  { key: 'transporters', label: 'Transporter scorecard' },
]
const tip = { contentStyle: { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 } }

export default function Performance() {
  const state = useStore()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'dealers'
  const [preset, setPreset] = useState('90D')
  const [region, setRegion] = useState('')
  const period = useMemo(() => periodFor(preset), [preset])
  const regions = [...new Set(state.partners.filter((p) => p.type === 'DEALER').map((p) => p.region))].sort()
  return (
    <div>
      <PageHeader
        title="Dealer & Logistics Performance"
        subtitle={`Contribution, growth, targets and logistics efficiency · ${fmtDate(period.from)} – ${fmtDate(period.to)}`}
        actions={<>
          <div className="w-40"><Select value={region} onChange={(e) => setRegion(e.target.value)} placeholder="All regions" options={regions} /></div>
          <Segmented size="sm" value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ key: p.key, label: p.label }))} />
        </>}
      />
      <Tabs className="mb-5" tabs={TABS} value={tab} onChange={(t) => setSp(t === 'dealers' ? {} : { tab: t }, { replace: true })} />
      {tab === 'dealers' && <DealersTab state={state} period={period} region={region} />}
      {tab === 'logistics' && <LogisticsTab state={state} period={period} region={region} />}
      {tab === 'transporters' && <TransportersTab state={state} period={period} region={region} />}
    </div>
  )
}

// ------------------------------------------------------------------ DEALERS
function DealersTab({ state, period, region }) {
  const { user } = useLookup()
  const [open, setOpen] = useState(null)
  const all = useMemo(() => dealerPerformance(state, period), [state, period])
  const rows = useMemo(() => all.filter((d) => !region || d.region === region), [all, region])
  const hasTargets = (state.targets || []).length > 0
  const total = sum(rows, (r) => r.revenue)
  const active = rows.filter((r) => r.revenue > 0)
  const top10Share = total ? round2((sum(active.slice(0, 10), (r) => r.revenue) / total) * 100) : 0
  const pareto = useMemo(() => {
    let cum = 0
    return active.slice(0, 15).map((r) => {
      cum += r.revenue
      return { label: r.name.split(' ').slice(0, 2).join(' '), id: r.id, revenue: r.revenue, cumPct: total ? round2((cum / total) * 100) : 0 }
    })
  }, [active, total])
  const rising = rows.filter((r) => r.growth != null && r.growth >= 20 && r.revenue > 0).sort((a, b) => b.growth - a.growth).slice(0, 5)
  const falling = rows.filter((r) => r.prevRevenue > 0 && (r.growth == null || r.growth <= -20)).sort((a, b) => (a.growth ?? -100) - (b.growth ?? -100)).slice(0, 5)
  const withTarget = rows.filter((r) => r.target)
  const achievers = withTarget.filter((r) => r.achievement >= 100).length
  const incentives = sum(rows, (r) => r.incentive)
  const byRegion = useMemo(() => {
    const m = {}
    for (const r of all) {
      const x = (m[r.region] = m[r.region] || { label: r.region, revenue: 0, prev: 0, dealers: 0 })
      x.revenue += r.revenue
      x.prev += r.prevRevenue
      x.dealers += r.revenue > 0 ? 1 : 0
    }
    return Object.values(m).filter((x) => x.revenue || x.prev).sort((a, b) => b.revenue - a.revenue)
  }, [all])
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat icon={Users} label="Buying dealers" value={`${active.length} / ${rows.length}`} sub={period.label} />
        <Stat icon={Award} tone="ink" label="Top 10 contribution" value={fmtPct(top10Share)} sub={`of ${fmtCompact(total)} revenue`} />
        <Stat icon={TrendingUp} tone="green" label="Target achievers (month)" value={hasTargets ? `${achievers} / ${withTarget.length}` : '—'} sub={hasTargets ? 'dealers at ≥100%' : 'no targets set'} />
        <Stat icon={Gift} tone="violet" label="Incentives earned (month)" value={hasTargets ? fmtINR(incentives) : '—'} sub="as per slab achieved" />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Dealer contribution (Pareto)" subtitle="Top 15 dealers – revenue and cumulative share of total">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={pareto} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={(e) => e?.activePayload?.[0] && setOpen(e.activePayload[0].payload.id)}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} tickFormatter={fmtCompact} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v}%`} />
              <Tooltip {...tip} formatter={(v, n) => (n === 'cumPct' ? [`${v}%`, 'Cumulative share'] : [fmtINR(v), 'Revenue'])} />
              <Bar yAxisId="l" dataKey="revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={28} cursor="pointer" isAnimationActive={false} />
              <Line yAxisId="r" dataKey="cumPct" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Region performance" subtitle="Revenue vs prior period">
          {byRegion.map((r) => {
            const g = r.prev ? round2(((r.revenue - r.prev) / r.prev) * 100) : null
            return (
              <div key={r.label} className="py-2 border-b border-slate-100 last:border-0">
                <div className="flex justify-between text-sm"><span className="font-medium text-slate-800">{r.label}</span><span className="tabular-nums">{fmtCompact(r.revenue)}</span></div>
                <div className="flex justify-between text-[11px] text-slate-500 mt-0.5"><span>{r.dealers} buying dealers</span>{g != null && <span className={g >= 0 ? 'text-emerald-600' : 'text-red-600'}>{g >= 0 ? '+' : ''}{g}% vs prior</span>}</div>
              </div>
            )
          })}
        </Card>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Rising dealers" subtitle="Growth ≥ 20% vs prior period">
          <HBarList items={rising.map((r) => ({ id: r.id, label: r.name, sub: r.city, value: r.revenue, extra: `+${fmtPct(r.growth, 0)}`, color: 'bg-emerald-500' }))} onClick={(it) => setOpen(it.id)} empty="No dealer grew 20%+ in this period." />
        </Card>
        <Card title="Declining dealers – act now" subtitle="Down 20% or more vs prior period">
          <HBarList items={falling.map((r) => ({ id: r.id, label: r.name, sub: r.city, value: r.prevRevenue, extra: r.growth == null ? 'no orders' : fmtPct(r.growth, 0), color: 'bg-red-400' }))} onClick={(it) => setOpen(it.id)} empty="No dealer declined 20%+ – healthy network." />
        </Card>
      </div>
      <DataTable
        exportName={`dealer-performance-${period.from}`}
        onRowClick={(r) => setOpen(r.id)}
        rows={rows}
        initialSort={{ key: 'revenue', dir: 'desc' }}
        filters={[{ key: 'tier', label: 'tiers', options: ['A', 'B', 'C'] }, { key: 'type', label: 'types', options: ['DEALER', 'FRANCHISE'] }]}
        columns={[
          { key: 'name', header: 'Dealer', render: (r) => <PartnerCell id={r.id} sub={`${r.city} · Tier ${r.tier}`} /> },
          { key: 'sp', header: 'Salesperson', value: (r) => user(r.salespersonId)?.name || '—' },
          { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => fmtINR(r.revenue) },
          { key: 'share', header: 'Contribution', align: 'right', render: (r) => fmtPct(r.share) },
          { key: 'growth', header: 'Growth', align: 'right', render: (r) => (r.growth == null ? '—' : <span className={r.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}>{r.growth >= 0 ? '+' : ''}{fmtPct(r.growth)}</span>) },
          { key: 'marginPct', header: 'Margin', align: 'right', render: (r) => fmtPct(r.marginPct) },
          { key: 'aov', header: 'Avg order', align: 'right', render: (r) => fmtCompact(r.aov) },
          { key: 'target', header: 'Target (month)', align: 'right', hidden: !hasTargets, render: (r) => (r.target ? fmtCompact(r.target) : '—') },
          { key: 'achievement', header: 'Achieved', align: 'right', hidden: !hasTargets, render: (r) => (r.achievement == null ? '—' : <div className="flex items-center gap-2 justify-end"><div className="w-14"><Progress value={r.achievement} tone={r.achievement >= 100 ? 'green' : r.achievement >= 70 ? 'amber' : 'red'} /></div><span className="tabular-nums w-11">{fmtPct(r.achievement, 0)}</span></div>) },
          { key: 'incentive', header: 'Incentive', align: 'right', hidden: !hasTargets, render: (r) => (r.incentive ? <span className="text-emerald-700 font-medium">{fmtINR(r.incentive)}</span> : '—') },
          { key: 'lastOrderDate', header: 'Last order', render: (r) => (r.lastOrderDate ? <span className={daysBetween(r.lastOrderDate, today()) > (state.settings.alertRules?.dealerInactiveDays || 45) ? 'text-red-600' : ''}>{fmtDate(r.lastOrderDate)}</span> : '—') },
        ]}
      />
      {open && <DealerDrawer partnerId={open} period={period} onClose={() => setOpen(null)} />}
    </div>
  )
}

// ------------------------------------------------------------------ LOGISTICS
const PROVIDERS = [
  { id: 'lg1', key: 'BTALI', name: 'Btali 3PL', role: 'Warehousing & handling', icon: Warehouse, color: CHART_COLORS[1] },
  { id: 'lg2', key: 'SAFEX', name: 'Safex Transport', role: 'Outbound pick-up & delivery', icon: Truck, color: CHART_COLORS[0] },
  { id: 'fw3', key: 'GAF', name: 'GAF Logistics', role: 'Import forwarding & clearing', icon: Container, color: CHART_COLORS[2] },
]
const billAmt = (state, b) => b.amountINR ?? (b.amount || 0) * (b.fxRate || state.settings.fx?.[b.currency] || 1)

function LogisticsTab({ state, period, region }) {
  const { transporter, vendor } = useLookup()
  const partnerRegion = useMemo(() => Object.fromEntries(state.partners.map((p) => [p.id, p.region])), [state.partners])
  const invs = state.invoices.filter((i) => i.date >= period.from && i.date <= period.to && (!region || partnerRegion[i.partnerId] === region))
  const bills = (state.vendorBills || []).filter((b) => b.status !== 'REJECTED')
  const months = lastMonths(12)

  const provider = PROVIDERS.map((p) => {
    const pb = bills.filter((b) => b.vendorId === p.id && b.date >= period.from && b.date <= period.to)
    const spend = sum(pb, (b) => billAmt(state, b))
    let driver = 0
    let driverLabel = ''
    let freightRecorded = 0
    if (p.key === 'BTALI') { driver = invs.filter((i) => i.lr).length; driverLabel = 'dispatches handled' }
    if (p.key === 'SAFEX') {
      const si = invs.filter((i) => state.transporters.find((t) => t.id === i.transporterId)?.isSafex)
      driver = si.length
      driverLabel = 'Safex dispatches'
      freightRecorded = sum(si, (i) => i.freightCost || 0)
    }
    if (p.key === 'GAF') {
      const sh = state.shipments.filter((s) => s.indianForwarderId === p.id && (s.ata || s.eta) >= period.from && (s.ata || s.eta) <= period.to)
      driver = sh.length
      driverLabel = 'containers'
      freightRecorded = sum(sh.filter((s) => s.landedCost?.finalized), (s) => (s.landedCost.cha || 0) + (s.landedCost.portTransport || 0) + (s.landedCost.other || 0))
    }
    const cost = spend || freightRecorded
    return { ...p, bills: pb, spend, driver, driverLabel, cost, perUnit: driver ? round2(cost / driver) : 0, source: spend ? 'bills' : freightRecorded ? (p.key === 'GAF' ? 'landed-cost sheets' : 'invoice freight') : null }
  })

  const monthly = months.map((m) => {
    const mi = state.invoices.filter((i) => i.date.slice(0, 7) === m && (!region || partnerRegion[i.partnerId] === region))
    const row = { label: monthLabel(m), dispatches: mi.filter((i) => i.lr).length, freight: Math.round(sum(mi, (i) => i.freightCost || 0)) }
    for (const p of PROVIDERS) row[p.key] = Math.round(sum(bills.filter((b) => b.vendorId === p.id && String(b.date).slice(0, 7) === m), (b) => billAmt(state, b)))
    return row
  })
  const hasBills = PROVIDERS.some((p) => monthly.some((r) => r[p.key]))

  const byTransporter = useMemo(() => {
    const m = {}
    for (const i of invs) {
      const k = i.transporterId || '—'
      const r = (m[k] = m[k] || { id: k, invoices: 0, freight: 0, value: 0, withFreight: 0 })
      r.invoices++
      r.value += i.subtotal || 0
      if (i.freightCost) { r.freight += i.freightCost; r.withFreight++ }
    }
    return Object.values(m).map((r) => ({ ...r, name: transporter(r.id)?.name || 'Self pickup', perInvoice: r.withFreight ? round2(r.freight / r.withFreight) : null, pctOfValue: r.value ? round2((r.freight / r.value) * 100) : 0 })).sort((a, b) => b.freight - a.freight)
  }, [invs]) // eslint-disable-line
  const totFreight = sum(byTransporter, (r) => r.freight)
  const withFreight = sum(byTransporter, (r) => r.withFreight)
  const containers = state.shipments.filter((s) => s.landedCost?.finalized).map((s) => {
    const lc = s.landedCost
    const pos = state.purchaseOrders.filter((p) => s.poIds.includes(p.id))
    const cbm = sum(pos, (p) => sum(p.lines, (l) => l.qty * (state.products.find((x) => x.id === l.productId)?.cbm || 0)))
    const logistics = (lc.freightINR || 0) + (lc.cha || 0) + (lc.portTransport || 0) + (lc.other || 0) + (lc.insurance || 0)
    return { id: s.id, number: s.number, containerNo: s.containerNo, type: s.containerType, forwarder: vendor(s.indianForwarderId)?.name, freight: lc.freightINR || 0, cha: lc.cha || 0, port: lc.portTransport || 0, other: (lc.other || 0) + (lc.insurance || 0), logistics, cbm: round2(cbm), perCbm: cbm ? round2(logistics / cbm) : 0, date: s.ata || s.eta }
  })
  const mis = state.misUploads || []
  const misResults = mis.flatMap((u) => (u.results || []).map((r) => ({ ...r, source: u.source })))
  const misMatch = misResults.filter((r) => r.status === 'MATCH').length

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        {provider.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-slate-100 text-ink-700"><p.icon className="w-5 h-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                <div className="text-[11px] text-slate-500">{p.role}</div>
              </div>
              {p.source && <Badge tone={p.source === 'bills' ? 'green' : 'gray'}>{p.source}</Badge>}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <MiniMetric label="Spend" value={p.cost ? fmtCompact(p.cost) : '—'} hint={p.bills.length ? `${p.bills.length} bills` : p.source ? '' : 'no bills posted'} />
              <MiniMetric label={p.driverLabel} value={fmtNum(p.driver)} />
              <MiniMetric label={`per ${p.key === 'GAF' ? 'container' : 'dispatch'}`} value={p.perUnit ? fmtCompact(p.perUnit) : '—'} />
            </div>
          </Card>
        ))}
      </div>
      <Grid cols={4}>
        <Stat icon={IndianRupee} label="Outbound freight" value={fmtCompact(totFreight)} sub={`${fmtNum(withFreight)} invoices with freight`} />
        <Stat icon={Truck} tone="ink" label="Freight per invoice" value={withFreight ? fmtINR(totFreight / withFreight) : '—'} sub={period.label} />
        <Stat icon={TrendingDown} tone="amber" label="Freight % of sales" value={fmtPct(sum(byTransporter, (r) => r.value) ? (totFreight / sum(byTransporter, (r) => r.value)) * 100 : 0, 2)} sub="on invoice value" />
        <Stat icon={ShieldCheck} tone="green" label="Btali billing accuracy" value={misResults.length ? fmtPct((misMatch / misResults.length) * 100, 0) : '—'} sub={misResults.length ? `${misResults.length - misMatch} mismatches in ${mis.length} MIS` : 'no MIS uploaded'} />
      </Grid>
      <Card title="Logistics spend vs dispatches" subtitle={hasBills ? 'Monthly bills from Btali, Safex and GAF, outbound freight and dispatch count' : 'Monthly outbound freight (invoice freight) vs number of dispatches'}>
        <ResponsiveContainer width="100%" height={290}>
          <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} tickFormatter={fmtCompact} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
            <Tooltip {...tip} formatter={(v, n) => (n === 'Dispatches' ? [fmtNum(v), n] : [fmtINR(v), n])} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="freight" name="Outbound freight" stackId="a" fill={CHART_COLORS[3]} maxBarSize={34} />
            {hasBills && PROVIDERS.map((p) => <Bar key={p.key} yAxisId="l" dataKey={p.key} name={`${p.name} bills`} stackId="a" fill={p.color} maxBarSize={34} />)}
            <Line yAxisId="r" dataKey="dispatches" name="Dispatches" stroke={CHART_COLORS[4]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        {!hasBills && <Alert tone="info" className="mt-2">Btali, Safex and GAF bills will be stacked here as soon as Accounts posts them under Vendor Bills.</Alert>}
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <DataTable
          exportName={`freight-by-transporter-${period.from}`}
          rows={byTransporter}
          searchable={false}
          pageSize={10}
          toolbar={<span className="text-xs text-slate-500">Freight cost per invoice by transporter</span>}
          columns={[
            { key: 'name', header: 'Transporter' },
            { key: 'invoices', header: 'Invoices', align: 'right' },
            { key: 'freight', header: 'Freight', align: 'right', render: (r) => fmtINR(r.freight) },
            { key: 'perInvoice', header: 'Per invoice', align: 'right', render: (r) => (r.perInvoice ? fmtINR(r.perInvoice) : '—') },
            { key: 'pctOfValue', header: '% of value', align: 'right', render: (r) => fmtPct(r.pctOfValue, 2) },
          ]}
        />
        <DataTable
          exportName="cost-per-container"
          rows={containers}
          searchable={false}
          pageSize={10}
          toolbar={<span className="text-xs text-slate-500">Import logistics cost per container (finalised landed cost)</span>}
          columns={[
            { key: 'number', header: 'Container', render: (r) => <div><div className="font-medium">{r.number}</div><div className="text-[11px] text-slate-500">{r.containerNo} · {r.type}</div></div> },
            { key: 'freight', header: 'Ocean freight', align: 'right', render: (r) => fmtCompact(r.freight) },
            { key: 'cha', header: 'CHA + port', align: 'right', value: (r) => r.cha + r.port, render: (r) => fmtCompact(r.cha + r.port) },
            { key: 'logistics', header: 'Total', align: 'right', render: (r) => fmtINR(r.logistics) },
            { key: 'perCbm', header: 'Per CBM', align: 'right', render: (r) => fmtINR(r.perCbm) },
          ]}
        />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ TRANSPORTERS
const ISSUE_RE = /transit|damag|short|wrong|mislabel|broken|missing/i

function TransportersTab({ state, period, region }) {
  const [sla, setSla] = useState(2)
  const partnerRegion = useMemo(() => Object.fromEntries(state.partners.map((p) => [p.id, p.region])), [state.partners])
  const invs = state.invoices.filter((i) => i.date >= period.from && i.date <= period.to && (!region || partnerRegion[i.partnerId] === region))
  const rows = useMemo(() => {
    const issuesByInv = {}
    for (const r of state.returns || []) if (r.invoiceId && ISSUE_RE.test(r.reason || '')) issuesByInv[r.invoiceId] = (issuesByInv[r.invoiceId] || 0) + 1
    const invByNo = Object.fromEntries(state.invoices.map((i) => [i.number, i.id]))
    const soToInv = Object.fromEntries(state.salesOrders.filter((s) => s.invoiceId).map((s) => [s.number, s.invoiceId]))
    for (const t of state.tickets || []) {
      if (!['DAMAGE_IN_TRANSIT', 'SHORTAGE', 'MISLABEL'].includes(t.category)) continue
      const id = invByNo[t.orderRef] || soToInv[t.orderRef]
      if (id) issuesByInv[id] = (issuesByInv[id] || 0) + 1
    }
    const m = {}
    for (const i of invs) {
      const k = i.transporterId || '—'
      const r = (m[k] = m[k] || { id: k, total: 0, dispatched: 0, onTime: 0, lrDays: [], pendingLate: 0, issues: 0, value: 0 })
      r.total++
      r.value += i.subtotal || 0
      if (i.lr?.date) {
        r.dispatched++
        const d = daysBetween(i.date, i.lr.date)
        r.lrDays.push(d)
        if (d <= sla) r.onTime++
      } else if (daysBetween(i.date, today()) > sla) r.pendingLate++
      r.issues += issuesByInv[i.id] || 0
    }
    return Object.values(m).map((r) => {
      const t = state.transporters.find((x) => x.id === r.id)
      const judged = r.dispatched + r.pendingLate
      const onTimePct = judged ? round2((r.onTime / judged) * 100) : null
      const accuracy = r.dispatched ? round2(((r.dispatched - r.issues) / r.dispatched) * 100) : null
      const score = onTimePct == null ? null : Math.round(onTimePct * 0.6 + (accuracy ?? 100) * 0.4)
      return { ...r, name: t?.name || 'Self pickup', regions: t?.regions?.join(', ') || '—', isSafex: !!t?.isSafex, avgLr: r.lrDays.length ? round2(sum(r.lrDays) / r.lrDays.length) : null, onTimePct, accuracy, score }
    }).sort((a, b) => b.total - a.total)
  }, [state, invs, sla])
  const chart = rows.filter((r) => r.onTimePct != null).map((r) => ({ label: r.name.split(' ').slice(0, 2).join(' '), onTime: r.onTimePct, accuracy: r.accuracy ?? 0 }))
  const totDisp = sum(rows, (r) => r.dispatched)
  const overall = sum(rows, (r) => r.dispatched + r.pendingLate)
  const exportScorecard = () => {
    exportCSV(`transporter-scorecard-${today()}.csv`, rows, [
      { header: 'Transporter', value: (r) => r.name }, { header: 'Regions', value: (r) => r.regions }, { header: 'Invoices', value: (r) => r.total },
      { header: 'Dispatched', value: (r) => r.dispatched }, { header: `On-time % (LR within ${sla} days)`, value: (r) => r.onTimePct ?? '' }, { header: 'Avg invoice to LR (days)', value: (r) => r.avgLr ?? '' },
      { header: 'Transit issues', value: (r) => r.issues }, { header: 'Accuracy %', value: (r) => r.accuracy ?? '' }, { header: 'Score', value: (r) => r.score ?? '' },
    ])
    toast.success('Scorecard exported')
  }
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat icon={Truck} label="Dispatches" value={fmtNum(totDisp)} sub={`${rows.length} transporters`} />
        <Stat icon={Timer} tone="green" label="On-time dispatch" value={overall ? fmtPct((sum(rows, (r) => r.onTime) / overall) * 100, 0) : '—'} sub={`LR within ${sla} day${sla > 1 ? 's' : ''} of invoice`} />
        <Stat icon={ShieldCheck} tone="blue" label="Delivery accuracy" value={totDisp ? fmtPct(((totDisp - sum(rows, (r) => r.issues)) / totDisp) * 100, 1) : '—'} sub={`${sum(rows, (r) => r.issues)} damage / short / wrong-item cases`} />
        <Stat icon={TrendingDown} tone="red" label="LR overdue" value={sum(rows, (r) => r.pendingLate)} sub={`invoices past ${sla}-day SLA`} />
      </Grid>
      <Card title="On-time vs accuracy by transporter" subtitle="On-time = LR uploaded within SLA · Accuracy = dispatches without transit damage, shortage or wrong item"
        actions={<div className="flex items-center gap-2"><span className="text-xs text-slate-500 hidden sm:inline">SLA</span><Segmented size="sm" value={sla} onChange={setSla} options={[{ key: 1, label: '1 day' }, { key: 2, label: '2 days' }, { key: 3, label: '3 days' }]} /></div>}>
        {chart.length ? <BarsChart data={chart} money={false} series={[{ key: 'onTime', label: 'On-time %', color: CHART_COLORS[2] }, { key: 'accuracy', label: 'Accuracy %', color: CHART_COLORS[1] }]} height={260} /> : <EmptyState title="No dispatches in this period" />}
      </Card>
      <DataTable
        rows={rows}
        searchable={false}
        toolbar={<Button size="sm" variant="secondary" icon={Download} onClick={exportScorecard}>Export scorecard</Button>}
        initialSort={{ key: 'total', dir: 'desc' }}
        columns={[
          { key: 'name', header: 'Transporter', render: (r) => <div><div className="font-medium text-slate-800 flex items-center gap-1.5">{r.name}{r.isSafex && <Badge tone="brand">Safex</Badge>}</div><div className="text-[11px] text-slate-500">{r.regions}</div></div> },
          { key: 'total', header: 'Invoices', align: 'right' },
          { key: 'value', header: 'Value', align: 'right', render: (r) => fmtCompact(r.value) },
          { key: 'avgLr', header: 'Avg inv → LR', align: 'right', render: (r) => (r.avgLr == null ? '—' : `${r.avgLr} d`) },
          { key: 'onTimePct', header: 'On-time', align: 'right', render: (r) => (r.onTimePct == null ? '—' : <Badge tone={r.onTimePct >= 95 ? 'green' : r.onTimePct >= 80 ? 'amber' : 'red'}>{fmtPct(r.onTimePct, 0)}</Badge>) },
          { key: 'issues', header: 'Transit issues', align: 'right' },
          { key: 'accuracy', header: 'Accuracy', align: 'right', render: (r) => (r.accuracy == null ? '—' : fmtPct(r.accuracy, 1)) },
          { key: 'pendingLate', header: 'LR overdue', align: 'right', render: (r) => (r.pendingLate ? <span className="text-red-600 font-medium">{r.pendingLate}</span> : 0) },
          { key: 'score', header: 'Score', align: 'right', render: (r) => (r.score == null ? '—' : <span className="font-bold tabular-nums">{r.score}</span>) },
        ]}
      />
    </div>
  )
}
