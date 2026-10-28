import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, IndianRupee, AlertTriangle, Ship, Store, ExternalLink } from 'lucide-react'
import { PageHeader, Grid, Stat, Card, Badge, Drawer, DescriptionList, SectionTitle, Segmented, Button } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell } from '../../../components/business'
import { useStore } from '../../../store'
import { fmtINR, fmtCompact, fmtNum, fmtDate, fmtDateTime, sum } from '../../../lib/format'
import { onHand, bookStock, incoming, stockStatus } from '../../../lib/stock'

const CATS = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']

export default function Stock() {
  const state = useStore()
  const { products, partners, settings, stockMoves, locations } = state
  const [sel, setSel] = useState(null)
  const [scope, setScope] = useState('ALL')
  const markup = settings.stockValuationMarkupPct || 0

  const rows = useMemo(() => products.filter((p) => p.active || onHand(state, p.id) > 0).map((p) => {
    const st = onHand(state, p.id)
    const guj = onHand(state, p.id, 'WH-GUJ')
    const book = bookStock(state, p.id)
    const inc = incoming(state, p.id)
    const partnerQty = sum(partners.filter((x) => x.type === 'DEALER' || x.type === 'FRANCHISE'), (x) => x.stock?.[p.id] || 0)
    const status = stockStatus(state, p)
    const nextEta = inc.map((x) => x.eta).filter(Boolean).sort()[0] || null
    return { ...p, btali: st, guj, book, available: st - book, inc, incQty: sum(inc, (x) => x.qty), nextEta, partnerQty, status, value: (st + guj) * p.landedCost }
  }), [state]) // eslint-disable-line

  const view = rows.filter((r) => scope === 'ALL' || r.type === scope)
  const totVal = sum(view, (r) => r.value)
  const cols = [
    { key: 'sku', header: 'Product', value: (r) => `${r.sku} ${r.shortName}`, render: (r) => <ProductCell product={r} /> },
    { key: 'category', header: 'Category' },
    { key: 'btali', header: 'Btali', align: 'right', render: (r) => fmtNum(r.btali) },
    { key: 'guj', header: 'Gujarat', align: 'right', render: (r) => (r.guj ? fmtNum(r.guj) : <span className="text-slate-300">0</span>) },
    { key: 'book', header: 'Book stock', align: 'right', render: (r) => (r.book ? <span className="text-amber-700">{fmtNum(r.book)}</span> : <span className="text-slate-300">0</span>) },
    { key: 'available', header: 'Available', align: 'right', render: (r) => <span className={r.available <= 0 ? 'text-red-600 font-bold' : 'font-semibold text-ink-900'}>{fmtNum(r.available)}</span> },
    { key: 'incQty', header: 'Incoming', align: 'right', render: (r) => (r.incQty ? <div><div>{fmtNum(r.incQty)}</div><div className="text-[10px] text-slate-500 whitespace-nowrap">{r.nextEta ? `ETA ${fmtDate(r.nextEta).slice(0, 6)}` : 'in production'}</div></div> : <span className="text-slate-300">—</span>) },
    { key: 'partnerQty', header: 'Dealer / franchise', align: 'right', render: (r) => fmtNum(r.partnerQty) },
    { key: 'status', header: 'Status', value: (r) => r.status.label, render: (r) => <Badge tone={r.status.tone} dot>{r.status.label}</Badge> },
    { key: 'value', header: 'Value (landed)', align: 'right', render: (r) => fmtINR(r.value) },
  ]
  const p = sel && rows.find((r) => r.id === sel)
  const moves = p ? stockMoves.filter((m) => m.productId === p.id).slice(0, 15) : []
  const holders = p ? partners.filter((x) => (x.stock?.[p.id] || 0) > 0).sort((a, b) => b.stock[p.id] - a.stock[p.id]) : []

  return (
    <div>
      <PageHeader title="Stock Overview" subtitle="Stock in hand, book stock (paid, not dispatched), available and incoming – finished goods and spares"
        actions={<Segmented value={scope} onChange={setScope} options={[{ key: 'ALL', label: 'All' }, { key: 'FG', label: 'Finished goods' }, { key: 'SPARE', label: 'Spares' }]} />} />
      <Grid cols={4} className="mb-4">
        <Stat label="Stock value at landed cost" value={fmtCompact(totVal)} icon={IndianRupee} sub={`${fmtNum(sum(view, (r) => r.btali + r.guj))} units`} />
        <Stat label={`Valuation (+${markup}% markup)`} value={fmtCompact(totVal * (1 + markup / 100))} icon={Boxes} tone="ink" />
        <Stat label="Below reorder / out" value={view.filter((r) => r.status.key === 'LOW' || r.status.key === 'OUT').length} icon={AlertTriangle} tone="amber" sub={`${view.filter((r) => r.status.key === 'OUT').length} out of stock`} />
        <Stat label="Incoming units" value={fmtNum(sum(view, (r) => r.incQty))} icon={Ship} tone="blue" sub={`${fmtNum(sum(view, (r) => r.partnerQty))} at dealers/franchise`} />
      </Grid>
      <DataTable rows={view} columns={cols} onRowClick={(r) => setSel(r.id)} exportName="btali-stock-overview" pageSize={15}
        filters={[
          { key: 'category', label: 'categories', options: CATS },
          { key: 'type', label: 'types', options: [{ value: 'FG', label: 'Finished goods' }, { value: 'SPARE', label: 'Spares' }] },
          { key: 'status', label: 'statuses', value: (r) => r.status.key, options: [{ value: 'OK', label: 'Healthy' }, { value: 'LOW', label: 'Below reorder' }, { value: 'OUT', label: 'Out of stock' }, { value: 'EXCESS', label: 'Excess' }] },
        ]} />

      <Drawer open={!!p} onClose={() => setSel(null)} title={p ? `${p.sku} – ${p.shortName}` : ''} subtitle={p && <Badge tone={p.status.tone} dot>{p.status.label}</Badge>}
        footer={p && <Link to={`/erp/masters/products?id=${p.id}`}><Button variant="secondary" icon={ExternalLink}>Open product master</Button></Link>}>
        {p && (
          <div className="space-y-5">
            <DescriptionList cols={4} items={[['Btali', fmtNum(p.btali)], ['Gujarat', fmtNum(p.guj)], ['Book stock', fmtNum(p.book)], ['Available', fmtNum(p.available)], ['Reorder level', fmtNum(p.reorderLevel)], ['Max level', fmtNum(p.maxLevel)], ['Landed cost', fmtINR(p.landedCost)], ['Value', fmtINR(p.value)]]} />
            <div>
              <SectionTitle>Incoming</SectionTitle>
              {p.inc.length ? (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-sm">
                  {p.inc.map((x) => <li key={x.poId} className="flex justify-between gap-3 px-3 py-2"><span><Link className="text-brand-600 hover:underline" to={`/erp/purchase/orders/${x.poId}`}>{x.poNumber}</Link> <Badge tone="blue">{x.stage.replace(/_/g, ' ')}</Badge></span><span className="tabular-nums">{fmtNum(x.qty)} · {x.eta ? `ETA ${fmtDate(x.eta)}` : 'ETA tbc'}</span></li>)}
                </ul>
              ) : <div className="text-sm text-slate-400">Nothing incoming.</div>}
            </div>
            <div>
              <SectionTitle>Held at dealers & franchise ({fmtNum(p.partnerQty)})</SectionTitle>
              {holders.length ? <div className="flex flex-wrap gap-2">{holders.slice(0, 12).map((h) => <Badge key={h.id} tone={h.type === 'FRANCHISE' ? 'violet' : 'gray'}><Store className="w-3 h-3" />{h.name} · {h.stock[p.id]}</Badge>)}</div> : <div className="text-sm text-slate-400">No partner stock reported.</div>}
            </div>
            <div>
              <SectionTitle actions={<Link to="/erp/inventory/moves" className="text-xs text-brand-600 hover:underline">All moves</Link>}>Recent stock moves</SectionTitle>
              {moves.length ? (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-sm">
                  {moves.map((m) => <li key={m.id} className="flex justify-between gap-3 px-3 py-2"><div><div>{m.reason}</div><div className="text-[11px] text-slate-400">{fmtDateTime(m.ts)} · {locations.find((l) => l.id === m.locationId)?.name || m.locationId}{m.ref ? ` · ${m.ref}` : ''}</div></div><span className={`tabular-nums font-semibold ${m.qty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{m.qty > 0 ? '+' : ''}{fmtNum(m.qty)}</span></li>)}
                </ul>
              ) : <div className="text-sm text-slate-400">No moves posted in this session yet.</div>}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
