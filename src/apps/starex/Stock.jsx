import React, { useMemo, useState } from 'react'
import { Boxes, AlertTriangle, ArrowDownLeft, ArrowUpRight, ScanLine, X } from 'lucide-react'
import { useStore, useLookup } from '../../store'
import { PageHeader, Grid, Stat, Card, Badge, StatusBadge, Tabs, Timeline, DescriptionList, IconButton, EmptyState, Barcode } from '../../components/ui'
import { ProductCell, ScanInput } from '../../components/business'
import DataTable from '../../components/DataTable'
import { fmtNum, fmtDate, fmtDateTime, sum, today } from '../../lib/format'
import { stockStatus } from '../../lib/stock'

const CATS = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']

export default function StarexStock() {
  const state = useStore()
  const { products, units, stockMoves, shipments, invoices } = state
  const stock = state.stock['WH-STAREX'] || {}
  const { product, partner } = useLookup()
  const [tab, setTab] = useState('STOCK')
  const [found, setFound] = useState(null)
  const [notFound, setNotFound] = useState('')

  const rows = useMemo(() => products.filter((p) => p.active !== false).map((p) => {
    const st = stockStatus(state, p)
    const booked = sum(state.salesOrders.filter((s) => s.status === 'PAID' && (s.warehouseId || 'WH-STAREX') === 'WH-STAREX'), (s) => sum(s.lines.filter((l) => l.productId === p.id), (l) => l.qty))
    const scheduled = sum(invoices.filter((i) => i.status === 'ISSUED' && i.locationId !== 'WH-GUJ'), (i) => sum(i.lines.filter((l) => l.productId === p.id), (l) => l.qty))
    const barcoded = units.filter((u) => u.productId === p.id && u.status === 'IN_WAREHOUSE' && u.locationId === 'WH-STAREX').length
    return { id: p.id, sku: p.sku, name: p.shortName, category: p.category, onHand: stock[p.id] || 0, booked, scheduled, barcoded, status: st, reorder: p.reorderLevel, cbm: (stock[p.id] || 0) * (p.cbm || 0) }
  }), [products, stock, units, invoices, state])

  // movement ledger: GRNs, live stock moves and dispatches (LR)
  const ledger = useMemo(() => {
    const out = []
    for (const m of stockMoves.filter((x) => x.locationId === 'WH-STAREX')) out.push({ id: m.id, ts: m.ts, date: m.date, dir: m.qty >= 0 ? 'IN' : 'OUT', productId: m.productId, qty: Math.abs(m.qty), ref: m.ref, reason: m.reason })
    for (const sh of shipments.filter((s) => s.inward?.grnNo && !stockMoves.some((m) => m.ref === s.inward.grnNo))) {
      for (const l of sh.inward.lines || []) out.push({ id: `${sh.id}-${l.productId}`, ts: `${sh.inward.date}T10:00:00Z`, date: sh.inward.date, dir: 'IN', productId: l.productId, qty: l.received, ref: sh.inward.grnNo, reason: `GRN inward · ${sh.containerNo}` })
    }
    for (const inv of invoices.filter((i) => i.lr && i.locationId !== 'WH-GUJ' && i.lr.date >= today().slice(0, 8) + '01' && !stockMoves.some((m) => m.ref === i.number))) {
      for (const l of inv.lines) out.push({ id: `${inv.id}-${l.productId}`, ts: `${inv.lr.date}T17:00:00Z`, date: inv.lr.date, dir: 'OUT', productId: l.productId, qty: l.qty, ref: inv.number, reason: `Dispatched · LR ${inv.lr.number}` })
    }
    return out.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  }, [stockMoves, shipments, invoices])

  const lookup = (code) => {
    const u = units.find((x) => x.code === code)
    if (!u) { setFound(null); setNotFound(code); return }
    setNotFound(''); setFound(u)
  }
  const inWh = units.filter((u) => u.status === 'IN_WAREHOUSE' && u.locationId === 'WH-STAREX')
  const totalUnits = sum(rows, (r) => r.onHand)
  const low = rows.filter((r) => r.status.key === 'LOW' || r.status.key === 'OUT')
  const t = today()
  const inToday = sum(ledger.filter((l) => l.date === t && l.dir === 'IN'), (l) => l.qty)
  const outToday = sum(ledger.filter((l) => l.date === t && l.dir === 'OUT'), (l) => l.qty)

  return (
    <div>
      <PageHeader title="Stock on hand" subtitle="Live stock of Btali goods at Starex 3PL, Bhiwandi" />
      <Grid cols={4}>
        <Stat label="Units on hand" value={fmtNum(totalUnits)} sub={`${rows.filter((r) => r.onHand > 0).length} SKUs`} icon={Boxes} tone="brand" />
        <Stat label="Below reorder level" value={low.length} icon={AlertTriangle} tone="amber" />
        <Stat label="Inward today" value={fmtNum(inToday)} icon={ArrowDownLeft} tone="green" />
        <Stat label="Outward today" value={fmtNum(outToday)} icon={ArrowUpRight} tone="blue" />
      </Grid>

      <Card className="mt-4" title="Barcode lookup" subtitle="Scan any unit or carton label to trace it">
        <ScanInput onScan={lookup} suggestions={inWh.slice(0, 40).map((u) => u.code)} autoFocus={false} />
        {notFound && <div className="mt-3 text-sm text-red-600">No Btali unit found for <span className="font-mono">{notFound}</span>.</div>}
        {found && (
          <div className="mt-4 grid md:grid-cols-3 gap-4 border border-slate-200 rounded-xl p-4 relative">
            <IconButton icon={X} title="Clear" className="absolute top-2 right-2" onClick={() => setFound(null)} />
            <div className="space-y-3">
              <ProductCell id={found.productId} />
              <Barcode value={found.code} height={36} />
              <StatusBadge status={found.status} />
            </div>
            <div><DescriptionList cols={1} items={[['Location', found.locationId === 'WH-STAREX' ? 'Starex – Bhiwandi' : partner(found.locationId)?.name || found.locationId], ['Customer', partner(found.partnerId)?.name || '—'], ['Invoice', invoices.find((i) => i.id === found.invoiceId)?.number || '—'], ['Pack qty', found.packQty || 1]]} /></div>
            <div className="max-h-56 overflow-y-auto"><Timeline items={[...found.history].reverse()} /></div>
          </div>
        )}
      </Card>

      <Tabs className="mt-5 mb-3" value={tab} onChange={setTab} tabs={[{ key: 'STOCK', label: 'Stock by SKU', count: rows.length }, { key: 'LEDGER', label: 'Inward / outward entries', count: ledger.length }, { key: 'UNITS', label: 'Barcoded units in warehouse', count: inWh.length }]} />
      {tab === 'STOCK' && (
        <DataTable rows={rows} exportName={`starex-stock-${t}`} filters={[{ key: 'category', label: 'categories', options: CATS }, { key: 'st', label: 'status', value: (r) => r.status.label, options: ['Healthy', 'Below reorder', 'Out of stock', 'Excess'] }]} initialSort={{ key: 'sku', dir: 'asc' }}
          columns={[
            { key: 'sku', header: 'Product', render: (r) => <ProductCell id={r.id} /> },
            { key: 'category', header: 'Category' },
            { key: 'onHand', header: 'On hand', align: 'right', render: (r) => <span className="font-semibold">{fmtNum(r.onHand)}</span> },
            { key: 'scheduled', header: 'Scheduled out', align: 'right', render: (r) => r.scheduled ? fmtNum(r.scheduled) : '—' },
            { key: 'booked', header: 'Booked (paid)', align: 'right', render: (r) => r.booked ? fmtNum(r.booked) : '—' },
            { key: 'barcoded', header: 'Barcoded', align: 'right' },
            { key: 'cbm', header: 'CBM occupied', align: 'right', render: (r) => fmtNum(Math.round(r.cbm * 10) / 10) },
            { key: 'status', header: 'Status', value: (r) => r.status.label, render: (r) => <Badge tone={r.status.tone} dot>{r.status.label}</Badge> },
          ]} />
      )}
      {tab === 'LEDGER' && (
        <DataTable rows={ledger} exportName="starex-movements" filters={[{ key: 'dir', label: 'directions', options: [{ value: 'IN', label: 'Inward' }, { value: 'OUT', label: 'Outward' }] }]}
          empty={<EmptyState title="No movements yet" />}
          columns={[
            { key: 'ts', header: 'When', render: (r) => fmtDateTime(r.ts) },
            { key: 'dir', header: 'Type', render: (r) => r.dir === 'IN' ? <Badge tone="green"><ArrowDownLeft className="w-3 h-3" />Inward</Badge> : <Badge tone="blue"><ArrowUpRight className="w-3 h-3" />Outward</Badge> },
            { key: 'product', header: 'Product', value: (r) => product(r.productId)?.sku, render: (r) => <ProductCell id={r.productId} /> },
            { key: 'qty', header: 'Qty', align: 'right', render: (r) => <span className={r.dir === 'IN' ? 'text-emerald-700 font-semibold' : 'text-sky-700 font-semibold'}>{r.dir === 'IN' ? '+' : '−'}{fmtNum(r.qty)}</span> },
            { key: 'ref', header: 'Reference', render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
            { key: 'reason', header: 'Detail' },
          ]} />
      )}
      {tab === 'UNITS' && (
        <DataTable rows={inWh} rowKey="code" exportName="starex-barcodes" onRowClick={(u) => { setFound(u); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          columns={[
            { key: 'code', header: 'Barcode', render: (u) => <span className="font-mono text-xs">{u.code}</span> },
            { key: 'product', header: 'Product', value: (u) => product(u.productId)?.sku, render: (u) => <ProductCell id={u.productId} /> },
            { key: 'packQty', header: 'Pack', align: 'right', value: (u) => u.packQty || 1 },
            { key: 'in', header: 'Inward', value: (u) => u.history.find((h) => /Inward/.test(h.event))?.ts || '', render: (u) => fmtDate(u.history.find((h) => /Inward/.test(h.event))?.ts) },
          ]} />
      )}
    </div>
  )
}
