import React, { useMemo, useState } from 'react'
import { ArrowLeftRight, SlidersHorizontal, ArrowDownToLine, ArrowUpFromLine, Plus } from 'lucide-react'
import { PageHeader, Grid, Stat, Button, Modal, FormGrid, Field, Select, NumberInput, Input, Combobox, Badge, Segmented, toast, Alert } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell } from '../../../components/business'
import { useStore } from '../../../store'
import { fmtNum, fmtDateTime, daysAgo, sum } from '../../../lib/format'
import { onHand, MAIN_WH } from '../../../lib/stock'

const REASONS = [
  { value: 'DAMAGED', label: 'Damaged / scrapped' },
  { value: 'CYCLE_COUNT', label: 'Cycle count variance' },
  { value: 'SAMPLE', label: 'Sample / display unit issued' },
  { value: 'WARRANTY_REPLACEMENT', label: 'Warranty replacement' },
  { value: 'FOUND', label: 'Found in physical verification' },
  { value: 'RETURN_TO_STOCK', label: 'Customer return to stock' },
  { value: 'OPENING', label: 'Opening balance correction' },
]
const SRC_TONE = { MANUAL: 'brand', GRN: 'green', INVOICE: 'blue', TRANSFER: 'violet', SYSTEM: 'gray' }

export default function Moves() {
  const stockMoves = useStore((s) => s.stockMoves)
  const invoices = useStore((s) => s.invoices)
  const shipments = useStore((s) => s.shipments)
  const pos = useStore((s) => s.purchaseOrders)
  const products = useStore((s) => s.products)
  const locations = useStore((s) => s.locations)
  const partners = useStore((s) => s.partners)
  const users = useStore((s) => s.users)
  const stock = useStore((s) => s.stock)
  const invAdjustStock = useStore((s) => s.invAdjustStock)
  const invTransfer = useStore((s) => s.invTransfer)
  const [modal, setModal] = useState(null) // 'adjust' | 'transfer'
  const [f, setF] = useState({})
  const set = (p) => setF((x) => ({ ...x, ...p }))

  const log = useMemo(() => {
    const live = stockMoves.map((m) => ({
      ...m,
      source: /^Adjustment/.test(m.reason) ? 'MANUAL' : /GRN/.test(m.reason) ? 'GRN' : /invoice/i.test(m.reason) ? 'INVOICE' : /transfer/i.test(m.reason) ? 'TRANSFER' : 'SYSTEM',
    }))
    const liveRefs = new Set(stockMoves.map((m) => m.ref))
    const hist = []
    const from = daysAgo(60)
    for (const inv of invoices) {
      if (inv.date < from || liveRefs.has(inv.number)) continue
      for (const l of inv.lines) if (!l.free) hist.push({ id: `h-${inv.id}-${l.productId}`, ts: `${inv.date}T11:00:00.000Z`, date: inv.date, locationId: inv.locationId || MAIN_WH, productId: l.productId, qty: -l.qty, reason: 'Sales invoice', ref: inv.number, userId: 'u8', source: 'INVOICE' })
    }
    for (const sh of shipments) {
      const g = sh.inward
      if (!g?.grnNo || liveRefs.has(g.grnNo)) continue
      const lines = g.lines?.length ? g.lines : pos.filter((p) => sh.poIds.includes(p.id)).flatMap((p) => p.lines.map((l) => {
        const d = (g.discrepancies || []).find((x) => x.productId === l.productId)
        return { productId: l.productId, received: d ? d.received : l.qty }
      }))
      for (const l of lines) if (l.received > 0) hist.push({ id: `g-${sh.id}-${l.productId}`, ts: `${g.date}T09:30:00.000Z`, date: g.date, locationId: MAIN_WH, productId: l.productId, qty: l.received, reason: 'GRN inward', ref: g.grnNo, userId: g.receivedBy, source: 'GRN' })
    }
    return [...live, ...hist].sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
  }, [stockMoves, invoices, shipments, pos])

  const last30 = log.filter((m) => m.date >= daysAgo(30))
  const prodOpts = products.filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: `Starex ${fmtNum(stock[MAIN_WH]?.[p.id] || 0)} · Gujarat ${fmtNum(stock['WH-GUJ']?.[p.id] || 0)}` }))
  const locOpts = locations.filter((l) => l.type !== 'TRANSIT').map((l) => ({ value: l.id, label: l.name }))
  const avail = f.productId && f.locationId ? onHand({ stock }, f.productId, f.locationId) : null
  const fromAvail = f.productId && f.fromLoc ? onHand({ stock }, f.productId, f.fromLoc) : null

  const open = (kind) => { setF(kind === 'adjust' ? { locationId: MAIN_WH, direction: 'OUT', qty: 1, reason: 'DAMAGED', note: '', productId: '' } : { fromLoc: MAIN_WH, toType: 'PARTNER', toId: '', qty: 1, note: '', productId: '' }); setModal(kind) }
  const saveAdjust = () => {
    if (!f.productId || !(f.qty > 0)) return toast.error('Select a product and quantity')
    if (!f.note.trim()) return toast.error('Reference / remarks are required for audit')
    if (f.direction === 'OUT' && f.qty > avail) return toast.error('Quantity exceeds stock at this location', `On hand: ${avail}`)
    const reason = REASONS.find((r) => r.value === f.reason).label
    invAdjustStock({ locationId: f.locationId, productId: f.productId, delta: f.direction === 'OUT' ? -f.qty : f.qty, reason, note: f.note })
    toast.success('Stock adjusted', `${f.direction === 'OUT' ? '−' : '+'}${f.qty} · ${reason}`)
    setModal(null)
  }
  const saveTransfer = () => {
    if (!f.productId || !f.toId || !(f.qty > 0)) return toast.error('Select product, destination and quantity')
    if (f.toType === 'LOCATION' && f.toId === f.fromLoc) return toast.error('Source and destination are the same')
    if (f.qty > fromAvail) return toast.error('Insufficient stock at source', `On hand: ${fromAvail}`)
    invTransfer({ fromLoc: f.fromLoc, toType: f.toType, toId: f.toId, productId: f.productId, qty: f.qty, note: f.note })
    const dest = f.toType === 'LOCATION' ? locations.find((l) => l.id === f.toId)?.name : partners.find((p) => p.id === f.toId)?.name
    toast.success('Transfer posted', `${f.qty} units → ${dest}`)
    setModal(null)
  }
  const locName = (id) => locations.find((l) => l.id === id)?.name || partners.find((p) => p.id === id)?.name || id
  const cols = [
    { key: 'ts', header: 'Date', render: (r) => <span className="text-xs whitespace-nowrap">{fmtDateTime(r.ts)}</span> },
    { key: 'productId', header: 'Product', value: (r) => products.find((p) => p.id === r.productId)?.sku, render: (r) => <ProductCell id={r.productId} size="xs" /> },
    { key: 'locationId', header: 'Location', value: (r) => locName(r.locationId) },
    { key: 'qty', header: 'Qty', align: 'right', render: (r) => <span className={`font-semibold ${r.qty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{r.qty > 0 ? '+' : ''}{fmtNum(r.qty)}</span> },
    { key: 'reason', header: 'Reason' },
    { key: 'ref', header: 'Reference', render: (r) => <span className="text-xs font-mono">{r.ref || '—'}</span> },
    { key: 'source', header: 'Source', render: (r) => <Badge tone={SRC_TONE[r.source]}>{r.source === 'MANUAL' ? 'Manual' : r.source === 'GRN' ? 'GRN' : r.source === 'INVOICE' ? 'Invoice' : r.source === 'TRANSFER' ? 'Transfer' : 'System'}</Badge> },
    { key: 'userId', header: 'By', value: (r) => users.find((u) => u.id === r.userId)?.name || 'System' },
  ]
  const partnerOpts = partners.filter((p) => (p.type === 'FRANCHISE' || p.type === 'DEALER') && p.status === 'ACTIVE').map((p) => ({ value: p.id, label: p.name, sub: `${p.type === 'FRANCHISE' ? 'Franchise' : 'Dealer'} · ${p.city}` }))

  return (
    <div>
      <PageHeader title="Stock Moves & Transfers" subtitle="Every stock posting – GRN inward, invoices, transfers and audited manual adjustments"
        actions={<><Button variant="secondary" icon={SlidersHorizontal} onClick={() => open('adjust')}>Adjust stock</Button><Button icon={ArrowLeftRight} onClick={() => open('transfer')}>New transfer</Button></>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Postings (30 days)" value={fmtNum(last30.length)} icon={ArrowLeftRight} />
        <Stat label="Units in (30 days)" value={fmtNum(sum(last30.filter((m) => m.qty > 0), (m) => m.qty))} icon={ArrowDownToLine} tone="green" />
        <Stat label="Units out (30 days)" value={fmtNum(-sum(last30.filter((m) => m.qty < 0), (m) => m.qty))} icon={ArrowUpFromLine} tone="blue" />
        <Stat label="Manual adjustments" value={fmtNum(log.filter((m) => m.source === 'MANUAL').length)} icon={SlidersHorizontal} tone="amber" />
      </Grid>
      <DataTable rows={log} columns={cols} exportName="btali-stock-moves" pageSize={15} dense
        filters={[
          { key: 'source', label: 'sources', options: [{ value: 'GRN', label: 'GRN' }, { value: 'INVOICE', label: 'Invoice' }, { value: 'TRANSFER', label: 'Transfer' }, { value: 'MANUAL', label: 'Manual' }, { value: 'SYSTEM', label: 'System' }] },
          { key: 'locationId', label: 'locations', options: locOpts },
        ]} />

      <Modal open={modal === 'adjust'} onClose={() => setModal(null)} title="Manual stock adjustment" subtitle="Posted to the stock ledger and audit log"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button onClick={saveAdjust}>Post adjustment</Button></>}>
        <FormGrid>
          <div className="md:col-span-2"><div className="text-xs font-medium text-slate-600 mb-1">Product *</div><Combobox options={prodOpts} value={f.productId} onChange={(v) => set({ productId: v })} placeholder="Select product…" /></div>
          <Field label="Location"><Select value={f.locationId || ''} options={locOpts} onChange={(e) => set({ locationId: e.target.value })} /></Field>
          <div><div className="text-xs font-medium text-slate-600 mb-1">Direction</div><Segmented value={f.direction} onChange={(v) => set({ direction: v })} options={[{ key: 'OUT', label: 'Reduce (−)' }, { key: 'IN', label: 'Increase (+)' }]} /></div>
          <Field label="Quantity" hint={avail != null ? `On hand: ${fmtNum(avail)}` : undefined}><NumberInput min={1} value={f.qty} onChange={(v) => set({ qty: v })} /></Field>
          <Field label="Reason code"><Select value={f.reason || ''} options={REASONS} onChange={(e) => set({ reason: e.target.value })} /></Field>
          <Field label="Reference / remarks" required className="md:col-span-2"><Input value={f.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Physical count 26-Oct, Starex MIS row 41" /></Field>
        </FormGrid>
      </Modal>

      <Modal open={modal === 'transfer'} onClose={() => setModal(null)} title="Stock transfer" subtitle="Between warehouses, or to a franchise store / dealer"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button icon={Plus} onClick={saveTransfer}>Post transfer</Button></>}>
        <FormGrid>
          <div className="md:col-span-2"><div className="text-xs font-medium text-slate-600 mb-1">Product *</div><Combobox options={prodOpts} value={f.productId} onChange={(v) => set({ productId: v })} placeholder="Select product…" /></div>
          <Field label="From location"><Select value={f.fromLoc || ''} options={locOpts} onChange={(e) => set({ fromLoc: e.target.value })} /></Field>
          <div><div className="text-xs font-medium text-slate-600 mb-1">Destination type</div><Segmented value={f.toType} onChange={(v) => set({ toType: v, toId: '' })} options={[{ key: 'PARTNER', label: 'Franchise / dealer' }, { key: 'LOCATION', label: 'Warehouse' }]} /></div>
          <div className="md:col-span-2"><div className="text-xs font-medium text-slate-600 mb-1">Destination *</div>
            {f.toType === 'LOCATION' ? <Select value={f.toId || ''} placeholder="Select warehouse…" options={locOpts.filter((l) => l.value !== f.fromLoc)} onChange={(e) => set({ toId: e.target.value })} />
              : <Combobox options={partnerOpts} value={f.toId} onChange={(v) => set({ toId: v })} placeholder="Select franchise store or dealer…" />}
          </div>
          <Field label="Quantity" hint={fromAvail != null ? `Available at source: ${fmtNum(fromAvail)}` : undefined}><NumberInput min={1} value={f.qty} onChange={(v) => set({ qty: v })} /></Field>
          <Field label="Reference / note"><Input value={f.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder="Stock transfer note / challan no." /></Field>
          {f.toType === 'PARTNER' && <Alert tone="info" className="md:col-span-2">Partner stock is increased immediately and the store is notified on its portal.</Alert>}
        </FormGrid>
      </Modal>
    </div>
  )
}
