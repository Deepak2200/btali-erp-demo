import React, { useMemo, useState } from 'react'
import { TrendingUp, IndianRupee, Percent, Package, Download, Target } from 'lucide-react'
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { PageHeader, Card, Grid, Stat, Button, Select, Drawer, DescriptionList, Badge, Tabs, SectionTitle } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, TrendChart, BarsChart, CHART_COLORS } from '../../../components/business'
import { profitability, monthlySeries, dateRangePresets, aggregate, salesLines } from '../../../lib/analytics'
import { fmtINR, fmtCompact, fmtPct, fmtNum, sum, round2, exportCSV } from '../../../lib/format'
import { CATEGORIES } from '../../../store/seed/core'
import { useAnalyticsState, PresetPicker, marginTone } from './_pdKit'

const CAT_COLOR = Object.fromEntries(CATEGORIES.map((c, i) => [c, CHART_COLORS[i % CHART_COLORS.length]]))

export default function Profitability() {
  const state = useAnalyticsState()
  const target = state.settings.targetMarginPct ?? 12
  const [preset, setPreset] = useState('12M')
  const [cat, setCat] = useState('')
  const [type, setType] = useState('')
  const [view, setView] = useState('products')
  const [openId, setOpenId] = useState(null)
  const range = dateRangePresets()[preset]

  const all = useMemo(() => profitability(state, range), [state, preset]) // eslint-disable-line
  const rows = useMemo(() => all.filter((r) => (!cat || r.category === cat) && (!type || state.products.find((p) => p.id === r.productId)?.type === type)), [all, cat, type, state.products])
  const sold = rows.filter((r) => r.qty > 0)
  const rev = sum(rows, (r) => r.revenue)
  const margin = sum(rows, (r) => r.margin)
  const cost = sum(rows, (r) => r.cost)
  const below = sold.filter((r) => r.marginPct < target)

  const catRows = useMemo(() => {
    const totRev = sum(all, (r) => r.revenue) || 1
    const totM = sum(all, (r) => r.margin) || 1
    return CATEGORIES.map((c) => {
      const list = all.filter((r) => r.category === c)
      const revenue = sum(list, (r) => r.revenue)
      const m = sum(list, (r) => r.margin)
      return { id: c, category: c, qty: sum(list, (r) => r.qty), revenue, cost: sum(list, (r) => r.cost), margin: m, marginPct: revenue ? round2((m / revenue) * 100) : 0, revenueShare: round2((revenue / totRev) * 100), profitShare: round2((m / totM) * 100), skus: list.filter((r) => r.qty).length }
    })
  }, [all])

  const scatter = sold.map((r) => ({ x: r.revenueShare, y: r.marginPct, z: r.margin, name: r.name, sku: r.sku, category: r.category, id: r.productId }))
  const avgShare = sold.length ? 100 / sold.length : 0

  const quadrant = (r) => (r.revenueShare >= avgShare ? (r.marginPct >= target ? ['Star', 'green'] : ['Volume driver', 'amber']) : r.marginPct >= target ? ['Niche gem', 'blue'] : ['Review', 'red'])

  const columns = [
    { key: 'name', header: 'Product', value: (r) => `${r.sku} ${r.name}`, render: (r) => <ProductCell id={r.productId} sub={r.category} /> },
    { key: 'qty', header: 'Units sold', align: 'right', render: (r) => fmtNum(r.qty) },
    { key: 'landedCost', header: 'Landed cost', align: 'right', render: (r) => fmtINR(r.landedCost) },
    { key: 'avgSellPrice', header: 'Avg sell price', align: 'right', render: (r) => (r.qty ? fmtINR(r.avgSellPrice) : '—') },
    { key: 'unitMargin', header: 'Unit margin', align: 'right', render: (r) => (r.qty ? fmtINR(r.unitMargin) : '—') },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => fmtCompact(r.revenue) },
    { key: 'margin', header: 'Gross margin', align: 'right', render: (r) => fmtCompact(r.margin) },
    { key: 'marginPct', header: 'Margin %', align: 'right', render: (r) => (r.qty ? <span className={`font-semibold ${marginTone(r.marginPct, target)}`}>{fmtPct(r.marginPct)}</span> : '—') },
    { key: 'revenueShare', header: 'Rev. share', align: 'right', render: (r) => fmtPct(r.revenueShare) },
    { key: 'profitShare', header: 'Profit share', align: 'right', render: (r) => fmtPct(r.profitShare) },
    { key: 'quad', header: 'Position', value: (r) => (r.qty ? quadrant(r)[0] : 'No sales'), render: (r) => (r.qty ? <Badge tone={quadrant(r)[1]}>{quadrant(r)[0]}</Badge> : <Badge>No sales</Badge>) },
  ]

  const exportAll = () => exportCSV(`product-profitability-${preset}.csv`, rows, [
    { header: 'SKU', key: 'sku' }, { header: 'Product', key: 'name' }, { header: 'Category', key: 'category' }, { header: 'Units sold', key: 'qty' },
    { header: 'Landed cost', key: 'landedCost' }, { header: 'Avg selling price', key: 'avgSellPrice' }, { header: 'Unit margin', key: 'unitMargin' },
    { header: 'Revenue', key: 'revenue' }, { header: 'Cost of sales', key: 'cost' }, { header: 'Gross margin', key: 'margin' }, { header: 'Margin %', key: 'marginPct' },
    { header: 'Revenue share %', key: 'revenueShare' }, { header: 'Profit share %', key: 'profitShare' },
  ])

  return (
    <div>
      <PageHeader title="Product Profitability" subtitle={`Landed cost vs sales realisation · ${range.label}`}
        actions={<>
          <PresetPicker value={preset} onChange={setPreset} />
          <Button variant="secondary" icon={Download} onClick={exportAll}>Export CSV</Button>
        </>} />

      <Grid cols={4}>
        <Stat label="Net revenue" value={fmtCompact(rev)} sub={`${fmtNum(sum(rows, (r) => r.qty))} units`} icon={IndianRupee} />
        <Stat label="Gross margin" value={fmtCompact(margin)} sub={`Cost of sales ${fmtCompact(cost)}`} icon={TrendingUp} tone="green" />
        <Stat label="Blended margin %" value={fmtPct(rev ? (margin / rev) * 100 : 0)} sub={`Target ${target}%`} icon={Percent} tone={rev && (margin / rev) * 100 >= target ? 'green' : 'amber'} />
        <Stat label="SKUs below target margin" value={below.length} sub={`of ${sold.length} selling SKUs`} icon={Target} tone={below.length ? 'red' : 'green'} onClick={() => setView('products')} />
      </Grid>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mt-4">
        <Card className="xl:col-span-3" title="Revenue share vs margin %" subtitle="Bubble size = gross margin ₹ · dashed lines = target margin & average share. Click a bubble to drill down.">
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="#f1f5f9" />
                <XAxis type="number" dataKey="x" name="Revenue share" unit="%" tick={{ fontSize: 11, fill: '#64748b' }} label={{ value: 'Revenue share %', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#64748b' }} />
                <YAxis type="number" dataKey="y" name="Margin" unit="%" tick={{ fontSize: 11, fill: '#64748b' }} width={44} />
                <ZAxis type="number" dataKey="z" range={[40, 600]} />
                <ReferenceLine y={target} stroke="#f2541f" strokeDasharray="5 4" label={{ value: `Target ${target}%`, position: 'insideTopRight', fontSize: 10, fill: '#f2541f' }} />
                <ReferenceLine x={round2(avgShare)} stroke="#94a3b8" strokeDasharray="4 4" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                  const d = payload?.[0]?.payload
                  if (!d) return null
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2.5 text-xs">
                      <div className="font-semibold text-slate-800">{d.name}</div>
                      <div className="text-slate-500">{d.sku} · {d.category}</div>
                      <div className="mt-1">Revenue share <b>{fmtPct(d.x)}</b> · Margin <b>{fmtPct(d.y)}</b></div>
                      <div>Gross margin <b>{fmtINR(d.z)}</b></div>
                    </div>
                  )
                }} />
                <Scatter data={scatter} onClick={(d) => setOpenId(d?.id || d?.payload?.id)} className="cursor-pointer">
                  {scatter.map((d) => <Cell key={d.id} fill={CAT_COLOR[d.category]} fillOpacity={0.75} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {CATEGORIES.map((c) => <span key={c} className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLOR[c] }} />{c}</span>)}
          </div>
        </Card>
        <Card className="xl:col-span-2" title="Profit contribution by category" subtitle="Revenue vs gross margin">
          <BarsChart data={catRows.map((c) => ({ label: c.category.replace('Equipment', 'Eqp.'), revenue: c.revenue, margin: c.margin }))} layout="vertical" height={300}
            series={[{ key: 'revenue', label: 'Revenue' }, { key: 'margin', label: 'Gross margin', color: CHART_COLORS[2] }]} />
        </Card>
      </div>

      <div className="mt-4">
        <Tabs className="mb-3" value={view} onChange={setView} tabs={[{ key: 'products', label: 'By product', count: rows.length }, { key: 'categories', label: 'By category', count: CATEGORIES.length }]} />
        {view === 'products' ? (
          <DataTable columns={columns} rows={rows.map((r) => ({ ...r, id: r.productId }))} onRowClick={(r) => setOpenId(r.productId)} initialSort={{ key: 'revenue', dir: 'desc' }} exportName={`product-margins-${preset}`}
            toolbar={<>
              <Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All categories" options={CATEGORIES} className="sm:w-48" />
              <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="FG + Spares" options={[{ value: 'FG', label: 'Finished goods' }, { value: 'SPARE', label: 'Spare parts' }]} className="sm:w-40" />
            </>}
            rowClass={(r) => (r.qty && r.marginPct < target ? 'bg-red-50/30' : '')} />
        ) : (
          <DataTable searchable={false} rows={catRows} exportName={`category-margins-${preset}`} onRowClick={(r) => { setCat(r.category); setView('products') }}
            columns={[
              { key: 'category', header: 'Category', render: (r) => <span className="font-medium text-slate-800 inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLOR[r.category] }} />{r.category}</span> },
              { key: 'skus', header: 'Selling SKUs', align: 'right' },
              { key: 'qty', header: 'Units', align: 'right', render: (r) => fmtNum(r.qty) },
              { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => fmtINR(r.revenue) },
              { key: 'cost', header: 'Landed cost of sales', align: 'right', render: (r) => fmtINR(r.cost) },
              { key: 'margin', header: 'Gross margin', align: 'right', render: (r) => fmtINR(r.margin) },
              { key: 'marginPct', header: 'Margin %', align: 'right', render: (r) => <span className={`font-semibold ${marginTone(r.marginPct, target)}`}>{fmtPct(r.marginPct)}</span> },
              { key: 'revenueShare', header: 'Revenue share', align: 'right', render: (r) => fmtPct(r.revenueShare) },
              { key: 'profitShare', header: 'Profit share', align: 'right', render: (r) => fmtPct(r.profitShare) },
            ]} />
        )}
      </div>

      <ProductDrawer id={openId} onClose={() => setOpenId(null)} row={all.find((r) => r.productId === openId)} state={state} target={target} range={range} />
    </div>
  )
}

function ProductDrawer({ id, onClose, row, state, target, range }) {
  const product = state.products.find((p) => p.id === id)
  const trend = useMemo(() => (id ? monthlySeries(state, 12, (l) => l.productId === id).map((m) => ({ ...m, cost: round2(m.revenue - m.margin), marginPct: m.revenue ? round2((m.margin / m.revenue) * 100) : 0 })) : []), [id, state])
  const dealers = useMemo(() => {
    if (!id) return []
    const lines = salesLines(state, range).filter((l) => l.productId === id)
    return aggregate(lines, (l) => l.partnerId).sort((a, b) => b.revenue - a.revenue).slice(0, 6).map((r) => ({ ...r, name: state.partners.find((p) => p.id === r.key)?.name || r.key }))
  }, [id, state, range])
  if (!product || !row) return null
  const mrpReal = product.mrp ? (row.avgSellPrice / product.mrp) * 100 : 0
  return (
    <Drawer open={!!id} onClose={onClose} title={product.shortName} subtitle={`${product.sku} · ${product.category} · ${range.label}`} width="max-w-3xl"
      footer={<Button variant="secondary" icon={Download} onClick={() => exportCSV(`${product.sku}-monthly-margin.csv`, trend, [{ header: 'Month', key: 'label' }, { header: 'Units', key: 'qty' }, { header: 'Revenue', key: 'revenue' }, { header: 'Cost', key: 'cost' }, { header: 'Margin', key: 'margin' }, { header: 'Margin %', key: 'marginPct' }])}>Export monthly trend</Button>}>
      <Grid cols={4}>
        <Stat label="Revenue" value={fmtCompact(row.revenue)} sub={`${fmtNum(row.qty)} units`} />
        <Stat label="Gross margin" value={fmtCompact(row.margin)} sub={`${fmtPct(row.profitShare)} of profit`} tone="green" />
        <Stat label="Margin %" value={fmtPct(row.marginPct)} sub={`Target ${target}%`} tone={row.marginPct >= target ? 'green' : 'red'} />
        <Stat label="Unit margin" value={fmtINR(row.unitMargin)} sub={`ASP ${fmtINR(row.avgSellPrice)}`} tone="ink" />
      </Grid>
      <Card className="mt-4" title="Monthly revenue & margin (12 months)">
        <TrendChart data={trend} series={[{ key: 'revenue', label: 'Revenue' }, { key: 'margin', label: 'Gross margin', color: CHART_COLORS[2] }]} height={220} />
      </Card>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card title="Unit economics">
          <DescriptionList cols={2} items={[
            ['Vendor rate', `${product.currency} ${product.vendorRate}`],
            ['Weighted landed cost', fmtINR(product.landedCost)],
            ['Last landed cost', product.lastLandedCost ? fmtINR(product.lastLandedCost) : '—'],
            ['MRP', fmtINR(product.mrp)],
            ['Avg selling price', fmtINR(row.avgSellPrice)],
            ['Realisation vs MRP', fmtPct(mrpReal)],
            ['Landed cost / MRP', fmtPct(product.mrp ? (product.landedCost / product.mrp) * 100 : 0)],
            ['Revenue share', fmtPct(row.revenueShare)],
          ]} />
        </Card>
        <Card title="Top buying partners">
          {dealers.length === 0 ? <div className="text-sm text-slate-400">No sales in this period.</div> : (
            <ul className="divide-y divide-slate-100">
              {dealers.map((d) => (
                <li key={d.key} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-slate-700">{d.name}</span>
                  <span className="tabular-nums text-slate-500 text-xs whitespace-nowrap">{fmtNum(d.qty)} u · {fmtCompact(d.revenue)} · <span className={marginTone(d.marginPct, target)}>{fmtPct(d.marginPct)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {(product.landedHistory || []).length > 0 && (
        <div className="mt-4">
          <SectionTitle>Landed cost history</SectionTitle>
          <ul className="text-sm divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {product.landedHistory.map((h, i) => <li key={i} className="px-3 py-2 flex justify-between"><span>{h.shipment} · {h.date}</span><span className="tabular-nums">{fmtINR(h.unit)} → weighted {fmtINR(h.weighted)}</span></li>)}
          </ul>
        </div>
      )}
      <div className="mt-4 text-xs text-slate-400 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />Margins use invoice realisation net of discounts & schemes, against weighted landed cost.</div>
    </Drawer>
  )
}
