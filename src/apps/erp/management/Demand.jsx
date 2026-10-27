import React, { useMemo, useState } from 'react'
import { LineChart as LineIcon, MapPin, TrendingUp, CalendarRange, Download } from 'lucide-react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from 'recharts'
import { PageHeader, Card, Grid, Stat, Button, Select, Segmented, Drawer, cx } from '../../../components/ui'
import { ProductCell, TrendChart, CHART_COLORS } from '../../../components/business'
import { salesLines, aggregate } from '../../../lib/analytics'
import { fmtINR, fmtCompact, fmtPct, fmtNum, sum, round2, lastMonths, monthLabel, exportCSV } from '../../../lib/format'
import { CATEGORIES, REGIONS } from '../../../store/seed/core'
import { useAnalyticsState, heat } from './_pdKit'

const ALL_REGIONS = [...REGIONS, 'Export']
const SHORT = { 'Air Compressors': 'Compressors', 'Vacuum Cleaners': 'Vacuums', 'Pressure Washers': 'Washers', 'Spraying Equipment': 'Sprayers', 'Spare Parts': 'Spares', Pumps: 'Pumps' }

export default function Demand() {
  const state = useAnalyticsState()
  const [metric, setMetric] = useState('revenue')
  const [cat, setCat] = useState('')
  const [region, setRegion] = useState('')
  const [partnerType, setPartnerType] = useState('')
  const [cell, setCell] = useState(null)
  const months = useMemo(() => lastMonths(12), [])
  const fmtV = (v) => (metric === 'revenue' ? fmtCompact(v) : fmtNum(v))

  const base = useMemo(() => salesLines(state, { from: `${months[0]}-01` }), [state, months])
  const lines = useMemo(() => base.filter((l) => (!cat || l.category === cat) && (!region || l.region === region) && (!partnerType || l.partnerType === partnerType)), [base, cat, region, partnerType])
  const val = (r) => (r ? r[metric] : 0)

  // region × month
  const regionGrid = useMemo(() => {
    const agg = Object.fromEntries(aggregate(lines, (l) => `${l.region}|${l.month}`).map((r) => [r.key, r]))
    const regs = ALL_REGIONS.filter((r) => lines.some((l) => l.region === r))
    const grid = regs.map((r) => ({ region: r, cells: months.map((m) => val(agg[`${r}|${m}`])), total: sum(months, (m) => val(agg[`${r}|${m}`])) }))
    const max = Math.max(1, ...grid.flatMap((g) => g.cells))
    return { grid, max }
  }, [lines, months, metric]) // eslint-disable-line

  // monthly totals + MoM
  const monthly = useMemo(() => {
    const agg = Object.fromEntries(aggregate(lines, (l) => l.month).map((r) => [r.key, r]))
    return months.map((m, i) => {
      const v = val(agg[m])
      const prev = i ? val(agg[months[i - 1]]) : null
      return { month: m, label: monthLabel(m), value: v, mom: prev ? round2(((v - prev) / prev) * 100) : null }
    })
  }, [lines, months, metric]) // eslint-disable-line

  // dealer × category
  const dealerGrid = useMemo(() => {
    const agg = Object.fromEntries(aggregate(lines, (l) => `${l.partnerId}|${l.category}`).map((r) => [r.key, r]))
    const byDealer = aggregate(lines, (l) => l.partnerId).sort((a, b) => val(b) - val(a)).slice(0, 15)
    const cats = cat ? [cat] : CATEGORIES
    const rows = byDealer.map((d) => {
      const p = state.partners.find((x) => x.id === d.key)
      return { id: d.key, name: p?.name || d.key, city: p?.city, region: p?.region, type: p?.type, total: val(d), cells: cats.map((c) => val(agg[`${d.key}|${c}`])) }
    })
    const max = Math.max(1, ...rows.flatMap((r) => r.cells))
    return { rows, cats, max }
  }, [lines, cat, metric, state.partners]) // eslint-disable-line

  // seasonality index per category (unfiltered by category so every line is visible)
  const season = useMemo(() => {
    const src = base.filter((l) => (!region || l.region === region) && (!partnerType || l.partnerType === partnerType))
    const agg = Object.fromEntries(aggregate(src, (l) => `${l.category}|${l.month}`).map((r) => [r.key, r]))
    const avg = Object.fromEntries(CATEGORIES.map((c) => [c, sum(months, (m) => agg[`${c}|${m}`]?.qty || 0) / months.length || 1]))
    return months.map((m) => ({ label: monthLabel(m), ...Object.fromEntries(CATEGORIES.map((c) => [c, round2((agg[`${c}|${m}`]?.qty || 0) / avg[c])])) }))
  }, [base, region, partnerType, months])

  const total = sum(monthly, (m) => m.value)
  const complete = monthly.slice(0, -1)
  const last = complete[complete.length - 1]
  const peak = [...complete].sort((a, b) => b.value - a.value)[0]
  const topRegion = [...regionGrid.grid].sort((a, b) => b.total - a.total)[0]
  const growthRegion = useMemo(() => {
    const out = regionGrid.grid.map((g) => {
      const recent = sum(g.cells.slice(-4, -1))
      const prior = sum(g.cells.slice(-7, -4))
      return { region: g.region, growth: prior ? ((recent - prior) / prior) * 100 : 0 }
    })
    return out.sort((a, b) => b.growth - a.growth)[0]
  }, [regionGrid])

  const cellDetail = useMemo(() => {
    if (!cell) return null
    const l = lines.filter((x) => x.region === cell.region && x.month === cell.month)
    return {
      products: aggregate(l, (x) => x.productId).sort((a, b) => val(b) - val(a)).slice(0, 10),
      dealers: aggregate(l, (x) => x.partnerId).sort((a, b) => val(b) - val(a)).slice(0, 8),
      total: sum(l, (x) => x[metric]),
    }
  }, [cell, lines, metric]) // eslint-disable-line

  const exportGrid = () => exportCSV(`demand-region-month-${metric}.csv`, regionGrid.grid, [
    { header: 'Region', key: 'region' }, ...months.map((m, i) => ({ header: monthLabel(m), value: (r) => r.cells[i] })), { header: 'Total', key: 'total' },
  ])

  return (
    <div>
      <PageHeader title="Demand Analytics" subtitle="Where, when and what Btali sells – last 12 months of invoiced sales"
        actions={<>
          <Segmented size="sm" value={metric} onChange={setMetric} options={[{ key: 'revenue', label: 'Revenue ₹' }, { key: 'qty', label: 'Units' }]} />
          <Button variant="secondary" icon={Download} onClick={exportGrid}>Export</Button>
        </>} />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All categories" options={CATEGORIES} className="sm:w-52" />
        <Select value={region} onChange={(e) => setRegion(e.target.value)} placeholder="All regions" options={ALL_REGIONS} className="sm:w-44" />
        <Select value={partnerType} onChange={(e) => setPartnerType(e.target.value)} placeholder="All channels" options={[{ value: 'DEALER', label: 'Dealers' }, { value: 'FRANCHISE', label: 'Franchise stores' }, { value: 'EXPORT', label: 'Export' }]} className="sm:w-44" />
        {(cat || region || partnerType) && <Button variant="ghost" size="sm" onClick={() => { setCat(''); setRegion(''); setPartnerType('') }}>Clear filters</Button>}
      </div>

      <Grid cols={4}>
        <Stat label={`12-month ${metric === 'revenue' ? 'revenue' : 'units'}`} value={fmtV(total)} sub={`${fmtV(total / 12)} / month avg`} icon={LineIcon} />
        <Stat label={`Last month (${last?.label || ''})`} value={fmtV(last?.value || 0)} trend={last?.mom ?? undefined} sub="vs previous month" icon={CalendarRange} tone="ink" />
        <Stat label="Top region" value={topRegion?.region || '—'} sub={topRegion ? `${fmtV(topRegion.total)} · ${fmtPct(total ? (topRegion.total / total) * 100 : 0)} share` : ''} icon={MapPin} tone="green" />
        <Stat label="Fastest growing region" value={growthRegion?.region || '—'} sub={growthRegion ? `${growthRegion.growth >= 0 ? '+' : ''}${growthRegion.growth.toFixed(1)}% last 3M vs prior 3M` : ''} icon={TrendingUp} tone="amber" />
      </Grid>

      <Card className="mt-4" title="Demand heatmap – region × month" subtitle="Click a cell to see what sold">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th className="text-left font-semibold text-slate-500 px-2 py-1 min-w-[90px]">Region</th>
                {months.map((m) => <th key={m} className="font-medium text-slate-500 px-1 py-1 whitespace-nowrap">{monthLabel(m)}</th>)}
                <th className="text-right font-semibold text-slate-500 px-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {regionGrid.grid.map((g) => (
                <tr key={g.region}>
                  <td className="px-2 py-1 font-medium text-slate-700">{g.region}</td>
                  {g.cells.map((v, i) => (
                    <td key={i} onClick={() => v && setCell({ region: g.region, month: months[i] })} title={`${g.region} · ${monthLabel(months[i])}: ${metric === 'revenue' ? fmtINR(v) : fmtNum(v)}`}
                      className={cx('text-center rounded-md px-1 py-2 tabular-nums min-w-[54px] transition-transform', v && 'cursor-pointer hover:scale-105')} style={heat(v / regionGrid.max)}>
                      {v ? fmtV(v).replace('₹', '') : '–'}
                    </td>
                  ))}
                  <td className="px-2 text-right font-semibold tabular-nums text-slate-800 whitespace-nowrap">{fmtV(g.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {regionGrid.grid.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">No sales for this selection.</div>}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <Card title="Month-on-month growth" subtitle="Bars = volume · line = MoM % (current month is month-to-date)">
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="v" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => (metric === 'revenue' ? fmtCompact(v) : fmtNum(v))} />
                <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v}%`} />
                <ReferenceLine yAxisId="p" y={0} stroke="#cbd5e1" />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v, n) => (n === 'mom' ? [v == null ? '—' : `${v}%`, 'MoM growth'] : [metric === 'revenue' ? fmtINR(v) : fmtNum(v), metric === 'revenue' ? 'Revenue' : 'Units'])} />
                <Bar yAxisId="v" dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={30}>
                  {monthly.map((m, i) => <Cell key={m.month} fill={i === monthly.length - 1 ? '#fdba9c' : CHART_COLORS[1]} />)}
                </Bar>
                <Line yAxisId="p" type="monotone" dataKey="mom" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {peak && <div className="text-xs text-slate-500 mt-1">Peak month: <b className="text-slate-700">{peak.label}</b> ({fmtV(peak.value)}).</div>}
        </Card>
        <Card title="Seasonality index by category" subtitle="Units vs 12-month average (1.0 = average month) – plan imports ahead of peaks">
          <TrendChart data={season} type="line" money={false} height={290} series={CATEGORIES.map((c, i) => ({ key: c, label: SHORT[c], color: CHART_COLORS[i] }))} />
        </Card>
      </div>

      <Card className="mt-4" title={`Dealer × category – top ${dealerGrid.rows.length} partners`} subtitle="Shows which partners buy which categories – white space = cross-sell opportunity"
        actions={<Button size="sm" variant="secondary" icon={Download} onClick={() => exportCSV(`dealer-category-${metric}.csv`, dealerGrid.rows, [{ header: 'Partner', key: 'name' }, { header: 'City', key: 'city' }, { header: 'Region', key: 'region' }, ...dealerGrid.cats.map((c, i) => ({ header: c, value: (r) => r.cells[i] })), { header: 'Total', key: 'total' }])}>Export</Button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th className="text-left font-semibold text-slate-500 px-2 py-1 min-w-[180px]">Partner</th>
                {dealerGrid.cats.map((c) => <th key={c} className="font-medium text-slate-500 px-1 py-1 whitespace-nowrap">{SHORT[c]}</th>)}
                <th className="text-right font-semibold text-slate-500 px-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {dealerGrid.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1">
                    <div className="font-medium text-slate-700 truncate max-w-[220px]">{r.name}</div>
                    <div className="text-[10px] text-slate-400">{r.city} · {r.region}{r.type === 'FRANCHISE' ? ' · Franchise' : r.type === 'EXPORT' ? ' · Export' : ''}</div>
                  </td>
                  {r.cells.map((v, i) => <td key={i} className="text-center rounded-md px-1 py-2 tabular-nums min-w-[64px]" style={heat(v / dealerGrid.max)}>{v ? fmtV(v).replace('₹', '') : '–'}</td>)}
                  <td className="px-2 text-right font-semibold tabular-nums text-slate-800 whitespace-nowrap">{fmtV(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dealerGrid.rows.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">No sales for this selection.</div>}
        </div>
      </Card>

      <Drawer open={!!cell} onClose={() => setCell(null)} title={cell ? `${cell.region} · ${monthLabel(cell.month)}` : ''} subtitle={cellDetail ? `${metric === 'revenue' ? fmtINR(cellDetail.total) : `${fmtNum(cellDetail.total)} units`}${cat ? ` · ${cat}` : ''}` : ''}>
        {cellDetail && (
          <div className="space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Top products</div>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {cellDetail.products.map((p) => (
                  <li key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <ProductCell id={p.key} />
                    <span className="text-sm tabular-nums text-slate-600 whitespace-nowrap">{fmtNum(p.qty)} u · {fmtCompact(p.revenue)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Buying partners</div>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {cellDetail.dealers.map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate text-slate-700">{state.partners.find((p) => p.id === d.key)?.name}</span>
                    <span className="tabular-nums text-slate-600 whitespace-nowrap">{d.orders} inv · {fmtCompact(d.revenue)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
