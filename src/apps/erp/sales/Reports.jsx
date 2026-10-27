import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { IndianRupee, TrendingUp, Users, Percent, Download } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Tabs, Segmented, Input, Badge, Progress, Button, Select } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PartnerCell, ProductCell, FMSBadge, TrendChart, BarsChart, DonutChart, CHART_COLORS } from '../../../components/business'
import { salesLines, aggregate, dateRangePresets } from '../../../lib/analytics'
import { fmtINR, fmtCompact, fmtPct, fmtNum, fmtDate, daysBetween, today, addDays, lastMonths, monthLabel, sum, round2, exportCSV } from '../../../lib/format'
import { useScope, ScopeToggle, targetRow, periodLabel, isInactive, REGIONS, CATEGORIES, SALES_PEOPLE } from './_shared'

const classify = (rows) => {
  // rank within FG / spares by qty → top 30% Fast, next 40% Medium, rest Slow
  const out = {}
  for (const type of ['FG', 'SPARE']) {
    const list = rows.filter((r) => r.type === type).sort((a, b) => b.qty - a.qty)
    list.forEach((r, i) => { out[r.productId] = r.qty === 0 ? 'S' : i / list.length < 0.3 ? 'F' : i / list.length < 0.7 ? 'M' : 'S' })
  }
  return out
}

function FmsMix({ f, m, s }) {
  const t = f + m + s || 1
  return (
    <div className="w-40">
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
        <div className="bg-emerald-500" style={{ width: `${(f / t) * 100}%` }} /><div className="bg-amber-400" style={{ width: `${(m / t) * 100}%` }} /><div className="bg-slate-400" style={{ width: `${(s / t) * 100}%` }} />
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">F {fmtPct((f / t) * 100, 0)} · M {fmtPct((m / t) * 100, 0)} · S {fmtPct((s / t) * 100, 0)}</div>
    </div>
  )
}

export default function Reports() {
  const state = useStore()
  const scope = useScope()
  const presets = dateRangePresets()
  const [preset, setPreset] = useState('90D')
  const [range, setRange] = useState({ from: presets['90D'].from, to: presets['90D'].to })
  const [tab, setTab] = useState('movement')
  const [fmsBy, setFmsBy] = useState('product')
  const [spFilter, setSpFilter] = useState('')
  const pickPreset = (k) => { setPreset(k); setRange({ from: presets[k].from, to: presets[k].to }) }

  const prodById = useMemo(() => Object.fromEntries(state.products.map((p) => [p.id, p])), [state.products])
  const partnerOk = (pid) => scope.inScope(pid) && (!spFilter || state.partners.find((p) => p.id === pid)?.salespersonId === spFilter)
  const lines = useMemo(() => salesLines(state, range).filter((l) => partnerOk(l.partnerId)), [state, range, scope.mine, spFilter]) // eslint-disable-line
  const span = Math.max(1, daysBetween(range.from, range.to))
  const prevRange = { from: addDays(range.from, -span - 1), to: addDays(range.from, -1) }
  const prevLines = useMemo(() => salesLines(state, prevRange).filter((l) => partnerOk(l.partnerId)), [state, range, scope.mine, spFilter]) // eslint-disable-line
  const revenue = sum(lines, (l) => l.revenue)
  const prevRevenue = sum(prevLines, (l) => l.revenue)
  const mrpValue = sum(lines, (l) => l.qty * (prodById[l.productId]?.mrp || 0))
  const dealersActive = new Set(lines.map((l) => l.partnerId)).size

  // ---------------- F/M/S
  const fms = useMemo(() => {
    const byProd = Object.fromEntries(aggregate(lines, (l) => l.productId).map((r) => [r.key, r]))
    const rows = state.products.map((p) => ({ productId: p.id, sku: p.sku, name: p.shortName, category: p.category, type: p.type, qty: byProd[p.id]?.qty || 0, revenue: byProd[p.id]?.revenue || 0, orders: byProd[p.id]?.orders || 0, perMonth: round2(((byProd[p.id]?.qty || 0) / span) * 30) }))
    const cls = classify(rows)
    rows.forEach((r) => { r.cls = cls[r.productId] })
    const group = (keyFn) => {
      const m = new Map()
      for (const l of lines) {
        const k = keyFn(l)
        const g = m.get(k) || { key: k, revenue: 0, qty: 0, F: 0, M: 0, S: 0 }
        g.revenue += l.revenue
        g.qty += l.qty
        g[cls[l.productId] || 'S'] += l.qty
        m.set(k, g)
      }
      return [...m.values()].map((g) => ({ ...g, revenue: round2(g.revenue), fastPct: g.qty ? round2((g.F / g.qty) * 100) : 0 }))
    }
    return { rows, category: group((l) => l.category), region: group((l) => l.region), dealer: group((l) => l.partnerId) }
  }, [lines, state.products, span])

  // ---------------- dealers
  const dealerRows = useMemo(() => {
    const cur = Object.fromEntries(aggregate(lines, (l) => l.partnerId).map((r) => [r.key, r]))
    const prev = Object.fromEntries(aggregate(prevLines, (l) => l.partnerId).map((r) => [r.key, r]))
    return state.partners.filter((p) => p.type !== 'EXPORT' && p.stage !== 'IN_DECISION' && partnerOk(p.id)).map((p) => {
      const c = cur[p.id] || { revenue: 0, qty: 0, orders: 0 }
      const pr = prev[p.id]?.revenue || 0
      const mrp = sum(lines.filter((l) => l.partnerId === p.id), (l) => l.qty * (prodById[l.productId]?.mrp || 0))
      const sos = state.salesOrders.filter((s) => s.partnerId === p.id && s.date >= range.from && s.date <= range.to && s.status !== 'CANCELLED')
      const withScheme = sos.filter((s) => s.appliedSchemes?.length).length
      return {
        id: p.id, name: p.name, region: p.region, tier: p.tier || p.type[0], salespersonId: p.salespersonId, revenue: c.revenue, prev: pr,
        growth: pr ? round2(((c.revenue - pr) / pr) * 100) : c.revenue ? 100 : 0, orders: c.orders, avgOrder: c.orders ? round2(c.revenue / c.orders) : 0,
        discountPct: mrp ? round2(((mrp - c.revenue) / mrp) * 100) : 0, schemeOrders: withScheme, schemeUptake: sos.length ? round2((withScheme / sos.length) * 100) : 0,
        lastOrder: p.lastOrderDate, inactive: isInactive(p, state.settings), daysSince: p.lastOrderDate ? daysBetween(p.lastOrderDate, today()) : null,
      }
    })
  }, [lines, prevLines, state.partners, state.salesOrders, range]) // eslint-disable-line

  // ---------------- region / salesperson trends
  const months = lastMonths(12)
  const trend12 = useMemo(() => salesLines(state, { from: `${months[0]}-01` }).filter((l) => partnerOk(l.partnerId)), [state, scope.mine, spFilter]) // eslint-disable-line
  const regionTrend = months.map((m) => {
    const row = { label: monthLabel(m) }
    for (const r of REGIONS) row[r] = round2(sum(trend12.filter((l) => l.month === m && l.region === r), (l) => l.revenue))
    return row
  })
  const spTrend = months.map((m) => {
    const row = { label: monthLabel(m) }
    for (const sp of SALES_PEOPLE) row[sp] = round2(sum(trend12.filter((l) => l.month === m && l.salespersonId === sp), (l) => l.revenue))
    return row
  })
  const regionMix = aggregate(lines, (l) => l.region).map((r) => ({ name: r.key, value: r.revenue })).sort((a, b) => b.value - a.value)
  const spMix = aggregate(lines, (l) => l.salespersonId || '—').map((r) => {
    const prev = sum(prevLines.filter((l) => l.salespersonId === r.key), (l) => l.revenue)
    return { key: r.key, name: state.users.find((u) => u.id === r.key)?.name || 'Direct / Export', value: r.revenue, prev, growth: prev ? round2(((r.revenue - prev) / prev) * 100) : 0, orders: r.orders, share: revenue ? round2((r.revenue / revenue) * 100) : 0 }
  }).sort((a, b) => b.value - a.value)
  const catMix = aggregate(lines, (l) => l.category).map((r) => ({ name: r.key, value: r.revenue })).sort((a, b) => b.value - a.value)

  // ---------------- pending payments
  const pending = state.salesOrders.filter((s) => partnerOk(s.partnerId) && s.status !== 'CANCELLED' && s.paymentStatus !== 'PAID').map((s) => ({
    id: s.id, number: s.number, partnerId: s.partnerId, date: s.date, status: s.status, total: s.total, paid: s.paidAmount || 0, due: round2(s.total - (s.paidAmount || 0)), age: daysBetween(s.date, today()),
    exception: s.status === 'INVOICED' || s.status === 'DISPATCHED' ? 'Dispatched before full payment' : daysBetween(s.date, today()) > 7 ? 'Advance pending > 7 days' : s.paymentStatus === 'PARTIAL' ? 'Part payment' : 'Awaiting advance',
  }))

  // ---------------- targets
  const latest = (type) => [...new Set((state.targets || []).filter((t) => t.ownerType === type).map((t) => t.period))].sort().reverse()
  const [dealerPeriod, setDealerPeriod] = useState(null)
  const [spPeriod, setSpPeriod] = useState(null)
  const dP = dealerPeriod || latest('DEALER')[0]
  const sP = spPeriod || latest('SALESPERSON')[0]
  const dealerTargets = (state.targets || []).filter((t) => t.ownerType === 'DEALER' && t.period === dP && partnerOk(t.ownerId)).map((t) => ({ ...targetRow(state, t), name: state.partners.find((p) => p.id === t.ownerId)?.name }))
  const spTargets = (state.targets || []).filter((t) => t.ownerType === 'SALESPERSON' && t.period === sP && (!scope.isExec || !scope.mine || t.ownerId === scope.user?.id)).map((t) => ({ ...targetRow(state, t), name: state.users.find((u) => u.id === t.ownerId)?.name }))

  // ---------------- pareto
  const pareto = (() => {
    const sorted = dealerRows.filter((d) => d.revenue > 0).sort((a, b) => b.revenue - a.revenue)
    const tot = sum(sorted, (d) => d.revenue) || 1
    let cum = 0
    return sorted.map((d, i) => { cum += d.revenue; return { ...d, rank: i + 1, label: d.name.split(' ').slice(0, 2).join(' '), share: round2((d.revenue / tot) * 100), cumPct: round2((cum / tot) * 100) } })
  })()
  const top80 = pareto.filter((d) => d.cumPct <= 80).length + 1

  const spName = (id) => state.users.find((u) => u.id === id)?.name || '—'
  const tabs = [
    { key: 'movement', label: 'F/M/S movement' },
    { key: 'dealers', label: 'Dealer performance' },
    { key: 'targets', label: 'Target vs achievement' },
    { key: 'regions', label: 'Region & salesperson' },
    { key: 'payments', label: 'Pending payments', count: pending.length },
    { key: 'pareto', label: 'Top dealers (Pareto)' },
  ]

  return (
    <div>
      <PageHeader title="Sales Reports" subtitle={`Invoiced sales (taxable value) · ${fmtDate(range.from)} – ${fmtDate(range.to)}`}
        actions={<>
          <ScopeToggle scope={scope} />
          {scope.canManage && <div className="w-44"><Select value={spFilter} onChange={(e) => setSpFilter(e.target.value)} placeholder="All salespeople" options={SALES_PEOPLE.map((id) => ({ value: id, label: spName(id) }))} /></div>}
        </>} />
      <div className="flex flex-col md:flex-row md:items-center gap-2 mb-4">
        <div className="overflow-x-auto no-scrollbar"><Segmented value={preset} onChange={pickPreset} options={Object.entries(presets).map(([k, v]) => ({ key: k, label: v.label }))} size="sm" /></div>
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" value={range.from} onChange={(e) => { setPreset(''); setRange((r) => ({ ...r, from: e.target.value })) }} className="w-40" />
          <span className="text-slate-400">to</span>
          <Input type="date" value={range.to} onChange={(e) => { setPreset(''); setRange((r) => ({ ...r, to: e.target.value })) }} className="w-40" />
        </div>
      </div>
      <Grid cols={4} className="mb-4">
        <Stat label="Net sales" value={fmtCompact(revenue)} icon={IndianRupee} tone="brand" trend={prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : null} sub="vs previous period" />
        <Stat label="Invoices" value={fmtNum(new Set(lines.map((l) => l.invoiceId)).size)} icon={TrendingUp} tone="ink" sub={`${fmtNum(sum(lines, (l) => l.qty))} units`} />
        <Stat label="Active dealers" value={dealersActive} icon={Users} tone="green" sub={`${dealerRows.filter((d) => d.inactive).length} inactive`} />
        <Stat label="Avg discount off MRP" value={fmtPct(mrpValue ? ((mrpValue - revenue) / mrpValue) * 100 : 0)} icon={Percent} tone="violet" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={tabs} />

      {tab === 'movement' && (
        <div className="space-y-4">
          <Segmented size="sm" value={fmsBy} onChange={setFmsBy} options={[{ key: 'product', label: 'By product' }, { key: 'category', label: 'By category' }, { key: 'region', label: 'By region' }, { key: 'dealer', label: 'By dealer' }]} />
          {fmsBy === 'product' ? (
            <DataTable rows={fms.rows} rowKey="productId" exportName={`fms-products-${range.from}`} initialSort={{ key: 'qty', dir: 'desc' }}
              filters={[{ key: 'cls', label: 'classes', options: [{ value: 'F', label: 'Fast' }, { value: 'M', label: 'Medium' }, { value: 'S', label: 'Slow' }] }, { key: 'category', label: 'categories', options: CATEGORIES }]}
              columns={[
                { key: 'name', header: 'Product', render: (r) => <ProductCell id={r.productId} /> },
                { key: 'category', header: 'Category' },
                { key: 'cls', header: 'Movement', render: (r) => <FMSBadge cls={r.cls} /> },
                { key: 'qty', header: 'Units sold', align: 'right', render: (r) => fmtNum(r.qty) },
                { key: 'perMonth', header: 'Units / month', align: 'right', render: (r) => fmtNum(r.perMonth) },
                { key: 'orders', header: 'Invoices', align: 'right' },
                { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => fmtINR(r.revenue) },
              ]} />
          ) : (
            <DataTable rows={fms[fmsBy]} rowKey="key" exportName={`fms-${fmsBy}-${range.from}`} initialSort={{ key: 'revenue', dir: 'desc' }}
              columns={[
                { key: 'key', header: fmsBy === 'dealer' ? 'Dealer' : fmsBy === 'region' ? 'Region' : 'Category', value: (r) => (fmsBy === 'dealer' ? state.partners.find((p) => p.id === r.key)?.name : r.key), render: (r) => (fmsBy === 'dealer' ? <PartnerCell id={r.key} /> : <span className="font-medium">{r.key}</span>) },
                { key: 'qty', header: 'Units', align: 'right', render: (r) => fmtNum(r.qty) },
                { key: 'mix', header: 'F / M / S mix (units)', sortable: false, value: (r) => `F ${r.F} / M ${r.M} / S ${r.S}`, render: (r) => <FmsMix f={r.F} m={r.M} s={r.S} /> },
                { key: 'fastPct', header: 'Fast-mover %', align: 'right', render: (r) => fmtPct(r.fastPct, 0) },
                { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => fmtINR(r.revenue) },
              ]} />
          )}
        </div>
      )}

      {tab === 'dealers' && (
        <DataTable rows={dealerRows} exportName={`dealer-performance-${range.from}`} initialSort={{ key: 'revenue', dir: 'desc' }}
          filters={[{ key: 'region', label: 'regions', options: REGIONS }, { key: 'inactive', label: 'activity', options: [{ value: 'true', label: 'Inactive' }, { value: 'false', label: 'Active' }] }]}
          columns={[
            { key: 'name', header: 'Dealer', render: (r) => <Link to={`/erp/sales/dealers/${r.id}`} className="hover:underline"><PartnerCell id={r.id} /></Link> },
            { key: 'salesperson', header: 'Salesperson', value: (r) => spName(r.salespersonId) },
            { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => fmtINR(r.revenue) },
            { key: 'growth', header: 'Growth', align: 'right', render: (r) => <span className={r.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}>{r.growth >= 0 ? '+' : ''}{fmtPct(r.growth)}</span> },
            { key: 'orders', header: 'Orders', align: 'right' },
            { key: 'avgOrder', header: 'Avg order', align: 'right', render: (r) => fmtCompact(r.avgOrder) },
            { key: 'discountPct', header: 'Discount utilised', align: 'right', render: (r) => fmtPct(r.discountPct) },
            { key: 'schemeUptake', header: 'Scheme uptake', align: 'right', render: (r) => `${r.schemeOrders} (${fmtPct(r.schemeUptake, 0)})` },
            { key: 'daysSince', header: 'Last order', align: 'right', render: (r) => <span className="whitespace-nowrap">{r.lastOrder ? fmtDate(r.lastOrder) : '—'} {r.inactive && <Badge tone="red">Inactive {r.daysSince}d</Badge>}</span> },
          ]} />
      )}

      {tab === 'targets' && (
        <div className="space-y-4">
          {[['Dealer targets', dealerTargets, dP, setDealerPeriod, 'DEALER', 'MONTH'], ['Salesperson targets', spTargets, sP, setSpPeriod, 'SALESPERSON', 'QUARTER']].map(([title, rows, per, setPer, type, pt]) => (
            <Card key={type} title={title} subtitle={`Achievement on invoiced value · slab incentive computed on highest slab reached`}
              actions={<>
                <div className="w-56"><Select value={per || ''} onChange={(e) => setPer(e.target.value)} options={latest(type).map((p) => ({ value: p, label: periodLabel(pt, p) }))} /></div>
                <Button size="sm" variant="secondary" icon={Download} onClick={() => exportCSV(`target-achievement-${type.toLowerCase()}-${per}.csv`, rows, [{ header: 'Name', key: 'name' }, { header: 'Target', key: 'amount' }, { header: 'Achieved', key: 'achieved' }, { header: 'Achievement %', key: 'pct' }, { header: 'Slab %', value: (r) => r.slab?.incentivePct || 0 }, { header: 'Incentive', key: 'incentive' }])}>CSV</Button>
              </>}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr><th className="text-left px-3 py-2">Name</th><th className="text-right px-3">Target</th><th className="text-right px-3">Achieved</th><th className="px-3 w-48 text-left">Achievement</th><th className="text-right px-3">Slab</th><th className="text-right px-3">Incentive</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...rows].sort((a, b) => b.pct - a.pct).map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                        <td className="px-3 text-right tabular-nums">{fmtINR(r.amount)}</td>
                        <td className="px-3 text-right tabular-nums">{fmtINR(r.achieved)}</td>
                        <td className="px-3"><Progress value={Math.min(r.pct, 100)} showLabel tone={r.pct >= 100 ? 'green' : r.pct >= 90 ? 'amber' : 'red'} /></td>
                        <td className="px-3 text-right">{r.slab ? <Badge tone="green">{r.slab.incentivePct}%</Badge> : '—'}</td>
                        <td className="px-3 text-right tabular-nums font-semibold">{fmtINR(r.incentive)}</td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={6} className="text-center text-slate-400 py-6">No targets for this period</td></tr>}
                  </tbody>
                  {rows.length > 0 && <tfoot className="bg-slate-50 font-semibold"><tr><td className="px-3 py-2">Total</td><td className="px-3 text-right tabular-nums">{fmtINR(sum(rows, (r) => r.amount))}</td><td className="px-3 text-right tabular-nums">{fmtINR(sum(rows, (r) => r.achieved))}</td><td className="px-3 text-xs">{fmtPct((sum(rows, (r) => r.achieved) / (sum(rows, (r) => r.amount) || 1)) * 100)}</td><td /><td className="px-3 text-right tabular-nums">{fmtINR(sum(rows, (r) => r.incentive))}</td></tr></tfoot>}
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'regions' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card title="Region trend (12 months)" className="xl:col-span-2"><BarsChart data={regionTrend} stacked height={300} series={REGIONS.map((r) => ({ key: r, label: r }))} /></Card>
            <Card title="Region contribution" subtitle="Selected period"><DonutChart data={regionMix} /></Card>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card title="Salesperson trend (12 months)" className="xl:col-span-2"><TrendChart type="line" data={spTrend} height={300} series={SALES_PEOPLE.map((id, i) => ({ key: id, label: spName(id), color: CHART_COLORS[i] }))} /></Card>
            <Card title="Category mix" subtitle="Selected period"><DonutChart data={catMix} /></Card>
          </div>
          <DataTable rows={spMix} rowKey="key" exportName={`salesperson-contribution-${range.from}`} searchable={false} initialSort={{ key: 'value', dir: 'desc' }} columns={[
            { key: 'name', header: 'Salesperson' },
            { key: 'value', header: 'Revenue', align: 'right', render: (r) => fmtINR(r.value) },
            { key: 'prev', header: 'Previous period', align: 'right', render: (r) => fmtINR(r.prev) },
            { key: 'growth', header: 'Growth', align: 'right', render: (r) => <span className={r.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}>{fmtPct(r.growth)}</span> },
            { key: 'orders', header: 'Invoices', align: 'right' },
            { key: 'share', header: 'Contribution', render: (r) => <div className="w-40"><Progress value={r.share} showLabel /></div> },
          ]} />
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-3">
          <Card><p className="text-sm text-slate-600">Btali works on an advance-payment model, so this report only lists exceptions: orders confirmed but not fully paid, part payments and anything invoiced before full payment.</p></Card>
          <DataTable rows={pending} exportName="pending-payments" initialSort={{ key: 'age', dir: 'desc' }}
            filters={[{ key: 'exception', label: 'exceptions', options: [...new Set(pending.map((p) => p.exception))] }]}
            columns={[
              { key: 'number', header: 'Order', render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`/erp/sales/orders/${r.id}`}>{r.number}</Link> },
              { key: 'partner', header: 'Dealer', value: (r) => state.partners.find((p) => p.id === r.partnerId)?.name, render: (r) => <PartnerCell id={r.partnerId} /> },
              { key: 'date', header: 'Order date', render: (r) => fmtDate(r.date) },
              { key: 'status', header: 'Status', render: (r) => <Badge tone="amber">{r.status.replace('_', ' ').toLowerCase()}</Badge> },
              { key: 'total', header: 'Order value', align: 'right', render: (r) => fmtINR(r.total) },
              { key: 'paid', header: 'Received', align: 'right', render: (r) => fmtINR(r.paid) },
              { key: 'due', header: 'Pending', align: 'right', render: (r) => <span className="font-semibold">{fmtINR(r.due)}</span> },
              { key: 'age', header: 'Age', align: 'right', render: (r) => <span className={r.age > 7 ? 'text-red-600 font-semibold' : ''}>{r.age}d</span> },
              { key: 'exception', header: 'Exception' },
            ]} />
        </div>
      )}

      {tab === 'pareto' && (
        <div className="space-y-4">
          <Card title="Dealer Pareto" subtitle={`${top80} of ${pareto.length} dealers make up 80% of revenue`}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={pareto} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={fmtCompact} width={56} axisLine={false} tickLine={false} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${v}%`} width={40} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, n) => (n === 'cumPct' ? [`${v}%`, 'Cumulative share'] : [fmtINR(v), 'Revenue'])} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="revenue" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Line yAxisId="r" dataKey="cumPct" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
          <DataTable rows={pareto} exportName={`dealer-pareto-${range.from}`} initialSort={{ key: 'rank', dir: 'asc' }} rowClass={(r) => (r.cumPct <= 80 ? 'bg-emerald-50/40' : '')} columns={[
            { key: 'rank', header: '#', align: 'right' },
            { key: 'name', header: 'Dealer', render: (r) => <PartnerCell id={r.id} /> },
            { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => fmtINR(r.revenue) },
            { key: 'share', header: 'Share', align: 'right', render: (r) => fmtPct(r.share) },
            { key: 'cumPct', header: 'Cumulative', align: 'right', render: (r) => fmtPct(r.cumPct) },
            { key: 'band', header: 'Band', value: (r) => (r.cumPct <= 80 ? 'A (top 80%)' : r.cumPct <= 95 ? 'B' : 'C'), render: (r) => <Badge tone={r.cumPct <= 80 ? 'green' : r.cumPct <= 95 ? 'amber' : 'gray'}>{r.cumPct <= 80 ? 'A – top 80%' : r.cumPct <= 95 ? 'B' : 'C'}</Badge> },
          ]} />
        </div>
      )}
    </div>
  )
}
