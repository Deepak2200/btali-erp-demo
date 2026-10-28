import React, { useMemo, useState } from 'react'
import { Download, TrendingUp, IndianRupee, Gift, Target } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Grid, Stat, Segmented, Badge, Tabs } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { TrendChart, BarsChart, DonutChart, ProductCell } from '../../components/business'
import { fmtINR, fmtNum, fmtDate, sum, lastMonths, monthKey, monthLabel, exportCSV, round2 } from '../../lib/format'
import { usePortal } from './_portal'

export default function Reports() {
  const { partnerId, partner } = usePortal()
  const invoices = useStore((s) => s.invoices)
  const receipts = useStore((s) => s.receipts)
  const salesOrders = useStore((s) => s.salesOrders)
  const products = useStore((s) => s.products)
  const targets = useStore((s) => s.targets)
  const [range, setRange] = useState('12')
  const [tab, setTab] = useState('products')
  const months = lastMonths(Number(range))
  const from = `${months[0]}-01`
  const inv = useMemo(() => invoices.filter((i) => i.partnerId === partnerId && i.date >= from), [invoices, partnerId, from])
  const pay = useMemo(() => receipts.filter((r) => r.partnerId === partnerId && r.date >= from).sort((a, b) => b.date.localeCompare(a.date)), [receipts, partnerId, from])
  const sos = useMemo(() => salesOrders.filter((s) => s.partnerId === partnerId && s.date >= from && s.status !== 'CANCELLED'), [salesOrders, partnerId, from])
  const pr = (id) => products.find((p) => p.id === id)
  const lines = inv.flatMap((i) => i.lines.map((l) => ({ ...l, date: i.date, p: pr(l.productId) })))

  const monthly = months.map((m) => {
    const t = (targets || []).find((x) => x.ownerType === 'DEALER' && x.ownerId === partnerId && x.period === m)
    return { label: monthLabel(m), purchases: round2(sum(inv.filter((i) => monthKey(i.date) === m), (i) => i.subtotal)), target: t?.amount || null }
  })
  const byCat = Object.entries(lines.reduce((a, l) => ({ ...a, [l.p?.category]: (a[l.p?.category] || 0) + (l.amount ?? l.qty * l.price) }), {})).map(([name, value]) => ({ name, value: round2(value) })).sort((a, b) => b.value - a.value)
  const byProd = Object.values(lines.reduce((a, l) => { const k = l.productId; a[k] = a[k] || { id: k, p: l.p, qty: 0, value: 0, orders: 0, last: '' }; a[k].qty += l.qty; a[k].value += l.amount ?? l.qty * l.price; a[k].orders += 1; a[k].last = l.date > a[k].last ? l.date : a[k].last; return a }, {})).map((x) => ({ ...x, value: round2(x.value), name: x.p?.shortName, sku: x.p?.sku, category: x.p?.category, cls: x.orders >= 4 ? 'Fast' : x.orders >= 2 ? 'Medium' : 'Slow' })).sort((a, b) => b.value - a.value)
  const savings = useMemo(() => {
    let scheme = 0, base = 0
    for (const s of sos) for (const l of s.lines) {
      if (l.free) { scheme += (pr(l.productId)?.mrp || 0) * 0.5 * l.qty; continue }
      const mrp = l.mrp || pr(l.productId)?.mrp || 0
      const sPct = sum((l.discounts || []).filter((d) => /^Scheme |^Combo /.test(d.label)), (d) => d.pct)
      scheme += mrp * (sPct / 100) * l.qty
      base += Math.max(0, mrp * l.qty - (l.amount ?? l.qty * l.price))
    }
    return { scheme: round2(scheme), total: round2(base) }
  }, [sos]) // eslint-disable-line
  const total = sum(inv, (i) => i.subtotal)
  const tgt = monthly.filter((m) => m.target)
  const achieved = tgt.length ? (sum(tgt, (m) => m.purchases) / sum(tgt, (m) => m.target)) * 100 : null

  const exportAll = () => exportCSV(`Purchases-${partner?.code}-${range}m.csv`, lines, [
    { header: 'Date', value: (l) => l.date }, { header: 'SKU', value: (l) => l.p?.sku }, { header: 'Product', value: (l) => l.p?.shortName }, { header: 'Category', value: (l) => l.p?.category }, { header: 'Qty', value: (l) => l.qty }, { header: 'Rate', value: (l) => l.price }, { header: 'Amount', value: (l) => l.amount ?? l.qty * l.price },
  ])

  return (
    <div>
      <PageHeader title="My reports" subtitle={`Purchases, savings, targets and payments · ${partner?.name}`}
        actions={<><Segmented value={range} onChange={setRange} options={[{ key: '3', label: '3M' }, { key: '6', label: '6M' }, { key: '12', label: '12M' }]} /><Button variant="secondary" icon={Download} onClick={exportAll}>Export CSV</Button></>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={TrendingUp} label="Purchases" value={fmtINR(total)} sub={`${inv.length} invoices`} />
        <Stat icon={IndianRupee} tone="green" label="Payments made" value={fmtINR(sum(pay, (r) => r.amount))} sub={`${pay.length} receipts`} />
        <Stat icon={Gift} tone="violet" label="Discount earned" value={fmtINR(savings.total)} sub={savings.scheme ? `${fmtINR(savings.scheme)} from schemes` : 'vs MRP'} />
        <Stat icon={Target} tone="amber" label="Target hit" value={achieved == null ? '—' : `${achieved.toFixed(0)}%`} sub={`${tgt.length} months with target`} />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Purchases vs target" className="lg:col-span-2"><TrendChart data={monthly} type="line" series={[{ key: 'purchases', label: 'Purchases' }, { key: 'target', label: 'Target', color: '#94a3b8', dashed: true }]} /></Card>
        <Card title="By category">{byCat.length ? <DonutChart data={byCat} /> : <div className="text-sm text-slate-400">No purchases in this period.</div>}</Card>
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'products', label: 'Top products' }, { key: 'fms', label: 'Fast / slow movers' }, { key: 'payments', label: 'Payment history' }]} />
      {tab === 'products' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Top 8 by value"><BarsChart data={byProd.slice(0, 8).map((x) => ({ label: x.name, value: x.value }))} layout="vertical" series={[{ key: 'value', label: 'Value' }]} height={300} /></Card>
          <DataTable rows={byProd} pageSize={8} exportName={`Top-products-${partner?.code}`} searchable={false}
            columns={[{ key: 'name', header: 'Product', render: (r) => <ProductCell id={r.id} /> }, { key: 'qty', header: 'Qty', align: 'right', render: (r) => fmtNum(r.qty) }, { key: 'value', header: 'Value', align: 'right', render: (r) => fmtINR(r.value) }]} />
        </div>
      )}
      {tab === 'fms' && (
        <DataTable rows={byProd} exportName={`Movers-${partner?.code}`} filters={[{ key: 'cls', label: 'movement', options: ['Fast', 'Medium', 'Slow'] }]}
          columns={[
            { key: 'name', header: 'Product', render: (r) => <ProductCell id={r.id} /> },
            { key: 'orders', header: 'Times ordered', align: 'right' },
            { key: 'qty', header: 'Qty', align: 'right', render: (r) => fmtNum(r.qty) },
            { key: 'last', header: 'Last bought', render: (r) => fmtDate(r.last) },
            { key: 'stock', header: 'My stock', align: 'right', value: (r) => partner?.stock?.[r.id] ?? '', render: (r) => (partner?.stock?.[r.id] != null ? fmtNum(partner.stock[r.id]) : '—') },
            { key: 'cls', header: 'Movement', render: (r) => <Badge tone={r.cls === 'Fast' ? 'green' : r.cls === 'Medium' ? 'amber' : 'gray'}>{r.cls}</Badge> },
          ]} />
      )}
      {tab === 'payments' && (
        <DataTable rows={pay} exportName={`Payments-${partner?.code}`} initialSort={{ key: 'date', dir: 'desc' }}
          columns={[
            { key: 'number', header: 'Receipt', render: (r) => <span className="font-mono">{r.number}</span> },
            { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'so', header: 'Order', value: (r) => salesOrders.find((s) => s.id === r.soId)?.number || '' },
            { key: 'mode', header: 'Mode' },
            { key: 'ref', header: 'UTR / Ref', render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => fmtINR(r.amount) },
          ]} />
      )}
    </div>
  )
}

