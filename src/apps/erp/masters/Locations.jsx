import React, { useMemo, useState } from 'react'
import { Plus, Warehouse, MapPin, Pencil, Boxes, IndianRupee, AlertTriangle } from 'lucide-react'
import { PageHeader, Grid, Stat, Button, Card, Modal, FormGrid, Field, Input, Select, Textarea, Badge, IconButton, Switch, toast, Drawer, Alert } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, DonutChart } from '../../../components/business'
import { useStore } from '../../../store'
import { fmtINR, fmtCompact, fmtNum, sum } from '../../../lib/format'

const TYPES = [{ value: 'WAREHOUSE', label: 'Warehouse (3PL / own)' }, { value: 'VIRTUAL', label: 'Virtual facility' }, { value: 'TRANSIT', label: 'Transit' }, { value: 'STORE', label: 'Store / showroom' }]
const blank = () => ({ name: '', code: '', type: 'WAREHOUSE', address: '', managedBy: '', note: '', primary: false, pendingConfirmation: false })
const pending = (l) => l.pendingConfirmation ?? /pending client confirmation/i.test(l.note || '')

export default function Locations() {
  const locations = useStore((s) => s.locations)
  const stock = useStore((s) => s.stock)
  const products = useStore((s) => s.products)
  const markup = useStore((s) => s.settings.stockValuationMarkupPct)
  const upsertLocation = useStore((s) => s.upsertLocation)
  const [f, setF] = useState(null)
  const [view, setView] = useState(null)
  const set = (p) => setF((x) => ({ ...x, ...p }))

  const stats = useMemo(() => Object.fromEntries(locations.map((l) => {
    const m = stock[l.id] || {}
    const items = products.filter((p) => (m[p.id] || 0) > 0)
    return [l.id, { skus: items.length, units: sum(items, (p) => m[p.id]), value: sum(items, (p) => m[p.id] * p.landedCost) }]
  })), [locations, stock, products])
  const total = sum(Object.values(stats), (s) => s.value)

  const save = () => {
    if (!f.name.trim() || !f.code.trim()) return toast.error('Name and code are required')
    upsertLocation({ ...f, code: f.code.toUpperCase(), note: f.pendingConfirmation && !/pending client confirmation/i.test(f.note || '') ? `${f.note ? `${f.note} · ` : ''}Pending client confirmation` : !f.pendingConfirmation ? (f.note || '').replace(/\s*·?\s*Pending client confirmation/i, '') : f.note })
    toast.success(f.id ? 'Location updated' : 'Location added', f.name)
    setF(null)
  }
  const cols = [
    { key: 'name', header: 'Location', render: (r) => <div><div className="font-medium text-slate-800 flex items-center gap-2 flex-wrap">{r.name}{r.primary && <Badge tone="brand">Primary</Badge>}{pending(r) && <Badge tone="amber">Pending client confirmation</Badge>}</div><div className="text-[11px] text-slate-500">{r.code} · {r.address}</div></div> },
    { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'VIRTUAL' ? 'violet' : r.type === 'TRANSIT' ? 'blue' : 'ink'}>{TYPES.find((t) => t.value === r.type)?.label || r.type}</Badge> },
    { key: 'managedBy', header: 'Managed by' },
    { key: 'skus', header: 'SKUs', align: 'right', value: (r) => stats[r.id]?.skus },
    { key: 'units', header: 'Units', align: 'right', value: (r) => stats[r.id]?.units, render: (r) => fmtNum(stats[r.id]?.units) },
    { key: 'value', header: 'Stock value (landed)', align: 'right', value: (r) => stats[r.id]?.value, render: (r) => <span className="font-semibold">{fmtINR(stats[r.id]?.value)}</span> },
    { key: 'val', header: `Valuation (+${markup}%)`, align: 'right', value: (r) => Math.round((stats[r.id]?.value || 0) * (1 + markup / 100)), render: (r) => fmtINR((stats[r.id]?.value || 0) * (1 + markup / 100)) },
    { key: 'e', header: '', sortable: false, export: false, render: (r) => <IconButton icon={Pencil} title="Edit" onClick={(e) => { e.stopPropagation(); setF({ ...r, pendingConfirmation: pending(r) }) }} /> },
  ]
  const vStock = view ? products.filter((p) => (stock[view.id]?.[p.id] || 0) > 0).map((p) => ({ ...p, qty: stock[view.id][p.id], value: stock[view.id][p.id] * p.landedCost })) : []
  const gujPending = locations.filter(pending)

  return (
    <div>
      <PageHeader title="Warehouses & Locations" subtitle="Stock-holding locations with on-hand value at landed cost"
        actions={<Button icon={Plus} onClick={() => setF(blank())}>Add location</Button>} />
      {gujPending.length > 0 && <Alert tone="warn" className="mb-4" title="Awaiting client confirmation">{gujPending.map((l) => l.name).join(', ')} is configured as a virtual facility for direct deliveries. Stock is tracked separately; confirm operating model before go-live.</Alert>}
      <Grid cols={4} className="mb-4">
        <Stat label="Locations" value={locations.length} icon={MapPin} sub={`${locations.filter((l) => l.type === 'WAREHOUSE').length} physical`} />
        <Stat label="Total stock value (landed)" value={fmtCompact(total)} icon={IndianRupee} tone="green" />
        <Stat label={`Valuation (+${markup}%)`} value={fmtCompact(total * (1 + markup / 100))} icon={Boxes} tone="ink" />
        <Stat label="Pending confirmation" value={gujPending.length} icon={AlertTriangle} tone="amber" />
      </Grid>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><DataTable rows={locations} columns={cols} onRowClick={setView} searchable={false} exportName="btali-locations" /></div>
        <Card title="Stock value by location">
          <DonutChart data={locations.map((l) => ({ name: l.name, value: Math.round(stats[l.id]?.value || 0) })).filter((x) => x.value > 0)} height={200} />
        </Card>
      </div>

      <Drawer open={!!view} onClose={() => setView(null)} title={view?.name} subtitle={view && `${view.code} · ${fmtInrSafe(stats[view.id]?.value)} at landed cost`}
        footer={<Button variant="secondary" icon={Pencil} onClick={() => { setF({ ...view, pendingConfirmation: pending(view) }); setView(null) }}>Edit location</Button>}>
        {view && (
          <div className="space-y-3">
            {pending(view) && <Alert tone="warn">Virtual facility – pending client confirmation.</Alert>}
            <div className="text-sm text-slate-600">{view.address} · {view.managedBy}</div>
            <DataTable rows={vStock} dense pageSize={20} exportName={`stock-${view.code}`} columns={[
              { key: 'sku', header: 'Product', value: (r) => `${r.sku} ${r.shortName}`, render: (r) => <ProductCell product={r} /> },
              { key: 'qty', header: 'Qty', align: 'right', render: (r) => fmtNum(r.qty) },
              { key: 'landedCost', header: 'Landed', align: 'right', render: (r) => fmtINR(r.landedCost) },
              { key: 'value', header: 'Value', align: 'right', render: (r) => fmtINR(r.value) },
            ]} empty={<div className="text-sm text-slate-400 text-center py-8">No stock at this location.</div>} />
          </div>
        )}
      </Drawer>

      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit location' : 'Add location'}
        footer={<><Button variant="secondary" onClick={() => setF(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {f && (
          <FormGrid>
            <Field label="Location name" required className="md:col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Code" required><Input value={f.code} onChange={(e) => set({ code: e.target.value })} disabled={!!f.id} /></Field>
            <Field label="Type"><Select value={f.type} options={TYPES} onChange={(e) => set({ type: e.target.value })} /></Field>
            <Field label="Address" className="md:col-span-2"><Textarea rows={2} value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
            <Field label="Managed by"><Input value={f.managedBy} onChange={(e) => set({ managedBy: e.target.value })} /></Field>
            <Field label="Note"><Input value={f.note || ''} onChange={(e) => set({ note: e.target.value })} /></Field>
            <div className="md:col-span-2 flex flex-wrap gap-6">
              <Switch checked={!!f.primary} onChange={(v) => set({ primary: v })} label="Primary dispatch warehouse" />
              <Switch checked={!!f.pendingConfirmation} onChange={(v) => set({ pendingConfirmation: v })} label="Pending client confirmation" />
            </div>
          </FormGrid>
        )}
      </Modal>
    </div>
  )
}
const fmtInrSafe = (v) => fmtINR(v || 0)
