import React, { useMemo, useState } from 'react'
import { Download, Receipt, TrendingUp, Wallet, AlertTriangle } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Grid, Stat, Segmented, Tabs, Badge, cx } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { TrendChart, DonutChart, ProductCell } from '../../components/business'
import { fmtINR, fmtNum, fmtDate, fmtDateTime, sum, daysAgo, addDays, round2, exportCSV } from '../../lib/format'
import { usePortal } from '../dealer/_portal'
import { summarize } from './Sessions'

export default function Reports() {
  const { partnerId, partner } = usePortal()
  const posOrders = useStore((s) => s.posOrders) || []
  const sessions = useStore((s) => s.posSessions) || []
  const invoices = useStore((s) => s.invoices)
  const products = useStore((s) => s.products)
  const [range, setRange] = useState('30')
  const [tab, setTab] = useState('product')
  const from = daysAgo(Number(range) - 1)
  const orders = useMemo(() => posOrders.filter((o) => o.partnerId === partnerId && o.date >= from), [posOrders, partnerId, from])
  const lines = orders.flatMap((o) => o.lines.map((l) => ({ ...l, date: o.date, order: o.number })))
  const total = sum(orders, (o) => o.total)
  const days = Array.from({ length: Number(range) }, (_, i) => addDays(from, i))
  const daily = days.map((d) => { const os = orders.filter((o) => o.date === d); return { label: new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), date: d, sales: round2(sum(os, (o) => o.total)), bills: os.length } })
  const pay = ['CASH', 'UPI', 'CARD', 'CREDIT'].map((m) => ({ name: m === 'CASH' ? 'Cash' : m === 'UPI' ? 'UPI' : m === 'CARD' ? 'Card' : 'Credit', value: round2(sum(orders, (o) => sum(o.payments.filter((p) => p.method === m), (p) => p.amount))) })).filter((x) => x.value > 0)
  const received = useMemo(() => {
    const m = {}
    for (const i of invoices.filter((x) => x.partnerId === partnerId && x.date >= from)) for (const l of i.lines) m[l.productId] = (m[l.productId] || 0) + l.qty
    return m
  }, [invoices, partnerId, from])
  const byProd = Object.values(lines.reduce((a, l) => { a[l.productId] = a[l.productId] || { id: l.productId, qty: 0, value: 0, disc: 0 }; a[l.productId].qty += l.qty; a[l.productId].value += l.qty * l.price; a[l.productId].disc += l.qty * ((l.mrp || l.price) - l.price); return a }, {}))
    .map((x) => { const stock = partner?.stock?.[x.id] || 0; const recv = received[x.id] || 0; return { ...x, value: round2(x.value), disc: round2(x.disc), stock, recv, sellThrough: x.qty + stock ? round2((x.qty / (x.qty + stock)) * 100) : 0, name: products.find((p) => p.id === x.id)?.shortName } })
    .sort((a, b) => b.value - a.value)
  const sess = sessions.filter((s) => s.partnerId === partnerId && s.status === 'CLOSED' && s.openedAt.slice(0, 10) >= from).map((s) => ({ ...s, sm: summarize(s, posOrders) }))
  const disc = sum(byProd, (x) => x.disc)

  return (
    <div>
      <PageHeader title="Store reports" subtitle={partner?.name}
        actions={<><Segmented value={range} onChange={setRange} options={[{ key: '7', label: '7 days' }, { key: '30', label: '30 days' }, { key: '90', label: '90 days' }]} />
          <Button variant="secondary" icon={Download} onClick={() => exportCSV(`POS-sales-${partner?.code}-${range}d.csv`, lines, [{ header: 'Date', value: (l) => l.date }, { header: 'Bill', value: (l) => l.order }, { header: 'SKU', value: (l) => products.find((p) => p.id === l.productId)?.sku }, { header: 'Product', value: (l) => products.find((p) => p.id === l.productId)?.shortName }, { header: 'Barcode', value: (l) => l.barcode || '' }, { header: 'Qty', value: (l) => l.qty }, { header: 'MRP', value: (l) => l.mrp }, { header: 'Disc %', value: (l) => l.discountPct || 0 }, { header: 'Price', value: (l) => l.price }, { header: 'Amount', value: (l) => l.qty * l.price }])}>Export CSV</Button></>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={TrendingUp} label="Sales" value={fmtINR(total)} sub={`${orders.length} bills`} />
        <Stat icon={Receipt} tone="ink" label="Average bill" value={fmtINR(orders.length ? total / orders.length : 0)} sub={`${fmtNum(sum(lines, (l) => l.qty))} units`} />
        <Stat icon={Wallet} tone="violet" label="Discount given" value={fmtINR(disc)} sub={total ? `${((disc / (total + disc)) * 100).toFixed(1)}% of MRP value` : ''} />
        <Stat icon={AlertTriangle} tone={sess.some((s) => s.variance) ? 'red' : 'green'} label="Cash variance" value={fmtINR(sum(sess, (s) => s.variance || 0))} sub={`${sess.length} sessions`} />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Daily sales" className="lg:col-span-2"><TrendChart data={daily} series={[{ key: 'sales', label: 'Sales' }]} height={240} /></Card>
        <Card title="Payment modes">{pay.length ? <DonutChart data={pay} /> : <div className="text-sm text-slate-400">No sales in this period.</div>}</Card>
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'product', label: 'By product & sell-through' }, { key: 'day', label: 'By day' }, { key: 'sessions', label: 'Session variances' }]} />
      {tab === 'product' && (
        <DataTable rows={byProd} exportName={`Sell-through-${partner?.code}`}
          columns={[
            { key: 'name', header: 'Product', render: (r) => <ProductCell id={r.id} /> },
            { key: 'qty', header: 'Sold', align: 'right' },
            { key: 'value', header: 'Sales', align: 'right', render: (r) => fmtINR(r.value) },
            { key: 'recv', header: 'Received', align: 'right' },
            { key: 'stock', header: 'In store', align: 'right' },
            { key: 'sellThrough', header: 'Sell-through', align: 'right', render: (r) => <Badge tone={r.sellThrough >= 50 ? 'green' : r.sellThrough >= 25 ? 'amber' : 'gray'}>{r.sellThrough}%</Badge> },
          ]} />
      )}
      {tab === 'day' && (
        <DataTable rows={[...daily].reverse().filter((d) => d.bills)} rowKey="date" searchable={false} exportName={`Daily-${partner?.code}`}
          columns={[{ key: 'date', header: 'Date', render: (d) => fmtDate(d.date) }, { key: 'bills', header: 'Bills', align: 'right' }, { key: 'sales', header: 'Sales', align: 'right', render: (d) => fmtINR(d.sales) }, { key: 'avg', header: 'Avg bill', align: 'right', value: (d) => round2(d.sales / d.bills), render: (d) => fmtINR(d.sales / d.bills) }]} />
      )}
      {tab === 'sessions' && (
        <DataTable rows={sess} searchable={false} exportName={`Sessions-${partner?.code}`}
          columns={[
            { key: 'number', header: 'Session', render: (s) => <span className="font-mono">{s.number}</span> },
            { key: 'closedAt', header: 'Closed', render: (s) => fmtDateTime(s.closedAt) },
            { key: 'sales', header: 'Sales', align: 'right', value: (s) => s.sm.total, render: (s) => fmtINR(s.sm.total) },
            { key: 'expectedCash', header: 'Expected', align: 'right', render: (s) => fmtINR(s.expectedCash) },
            { key: 'countedCash', header: 'Counted', align: 'right', render: (s) => fmtINR(s.countedCash) },
            { key: 'variance', header: 'Variance', align: 'right', render: (s) => <span className={cx('font-medium', s.variance < 0 ? 'text-red-600' : s.variance > 0 ? 'text-amber-600' : 'text-emerald-600')}>{s.variance ? fmtINR(s.variance) : 'Nil'}</span> },
            { key: 'note', header: 'Note' },
          ]} />
      )}
    </div>
  )
}
