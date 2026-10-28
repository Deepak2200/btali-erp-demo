import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Package, Boxes, Cog, Ban, Pencil, Trash2, TrendingUp } from 'lucide-react'
import {
  PageHeader, Grid, Stat, Card, Button, Drawer, Tabs, FormGrid, Field, Input, NumberInput, Select, Textarea, Combobox, Switch,
  StatusBadge, Badge, IconButton, FileUpload, AttachmentList, ProductImage, SectionTitle, toast, confirm, KV, Alert,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, BarsChart } from '../../../components/business'
import { useStore } from '../../../store'
import { fmtINR, fmtNum, fmtMoney, sum } from '../../../lib/format'
import { forecastDemand } from '../../../lib/analytics'
import { onHand } from '../../../lib/stock'

const CATS = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']
const HSN = { Pumps: '8413', 'Air Compressors': '8414', 'Vacuum Cleaners': '8508', 'Pressure Washers': '8424', 'Spraying Equipment': '8424', 'Spare Parts': '8413' }

const blank = () => ({
  sku: '', name: '', shortName: '', category: 'Pumps', type: 'FG', hsn: '8413', gst: 18, uom: 'Nos', vendorId: 'v1', vendorIds: ['v1'], currency: 'USD',
  vendorRate: 0, landedCost: 0, mrp: 0, moq: 50, reorderLevel: 20, maxLevel: 80, leadTimeDays: 75, weightKg: 1, cbm: 0.01, cartonQty: 1, warrantyMonths: 12,
  specs: {}, description: '', boqNote: '', bom: [], media: [], active: true, popularity: 3,
})

/** Spare demand = Σ parent FG forecast × BOM qty (+ own direct sales forecast) */
function useSpareForecast(product) {
  const state = useStore()
  return useMemo(() => {
    if (!product || product.type !== 'SPARE') return null
    const parents = state.products.filter((f) => (f.bom || []).some((b) => b.productId === product.id))
    const own = forecastDemand(state, product.id, 3)
    const rows = parents.map((f) => {
      const qty = (f.bom.find((b) => b.productId === product.id)?.qty) || 1
      const fc = forecastDemand(state, f.id, 3)
      return { id: f.id, name: f.shortName, sku: f.sku, qtyPer: qty, months: fc.map((m) => m.qty * qty), total: sum(fc, (m) => m.qty * qty) }
    })
    const months = own.map((m, i) => ({ label: m.label, direct: m.qty, derived: sum(rows, (r) => r.months[i]) }))
    return { rows, months, total: sum(months, (m) => m.direct + m.derived) }
  }, [product, state])
}

function ProductDrawer({ open, product, onClose }) {
  const vendors = useStore((s) => s.vendors)
  const products = useStore((s) => s.products)
  const fx = useStore((s) => s.settings.fx)
  const mult = useStore((s) => s.settings.mrpMultiplier)
  const upsertProduct = useStore((s) => s.upsertProduct)
  const setProductActive = useStore((s) => s.setProductActive)
  const stock = useStore((s) => s.stock)
  const [f, setF] = useState(blank())
  const [tab, setTab] = useState('general')
  const [specRows, setSpecRows] = useState([])
  useEffect(() => {
    if (!open) return
    const p = product ? JSON.parse(JSON.stringify(product)) : blank()
    setF(p)
    setSpecRows(Object.entries(p.specs || {}).map(([k, v]) => ({ k, v })))
    setTab('general')
  }, [open, product])
  const live = products.find((p) => p.id === product?.id)
  const fc = useSpareForecast(live)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const suppliers = vendors.filter((v) => v.type === 'CHINA' || v.type === 'INDIA')
  const sugMrp = Math.max(10, Math.round(((Number(f.vendorRate) || 0) * (fx[f.currency] || 1) * mult) / 10) * 10)

  const save = () => {
    if (!f.sku.trim() || !f.name.trim()) return toast.error('SKU and product name are required')
    if (products.some((p) => p.sku.toLowerCase() === f.sku.trim().toLowerCase() && p.id !== f.id)) return toast.error('SKU already exists')
    if (!f.vendorId) return toast.error('Select the primary vendor')
    const specs = Object.fromEntries(specRows.filter((r) => r.k.trim()).map((r) => [r.k.trim(), r.v]))
    const vendorIds = [...new Set([f.vendorId, ...(f.vendorIds || [])])]
    const v = vendors.find((x) => x.id === f.vendorId)
    const data = { ...f, sku: f.sku.trim().toUpperCase(), shortName: f.shortName || f.name.replace(/^Btali\s+/i, ''), specs, vendorIds, currency: v?.currency || f.currency, bom: (f.bom || []).filter((b) => b.productId) }
    ;['vendorRate', 'landedCost', 'mrp', 'moq', 'reorderLevel', 'maxLevel', 'leadTimeDays', 'weightKg', 'cbm', 'cartonQty', 'warrantyMonths', 'gst'].forEach((k) => { data[k] = Number(data[k]) || 0 })
    if (!data.landedCost) data.landedCost = Math.round(data.vendorRate * (fx[data.currency] || 1) * (data.currency === 'INR' ? 1.06 : 1.3))
    if (!data.mrp) data.mrp = sugMrp
    upsertProduct(data)
    toast.success(f.id ? 'Product updated' : 'Product created', `${data.sku} – ${data.shortName}`)
    onClose()
  }
  const toggle = async () => {
    const ok = await confirm({ title: live.active ? 'Deactivate product?' : 'Activate product?', message: live.active ? 'Inactive products are hidden from order entry, price lists and the dealer portal. History is preserved.' : 'Product will be available for ordering again.', tone: live.active ? 'danger' : undefined, confirmText: live.active ? 'Deactivate' : 'Activate' })
    if (!ok) return
    setProductActive(live.id, !live.active)
    toast.success(live.active ? 'Product deactivated' : 'Product activated')
  }

  const spareOpts = products.filter((p) => p.type === 'SPARE' && p.id !== f.id).map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}` }))
  const tabs = [{ key: 'general', label: 'General' }, { key: 'sourcing', label: 'Sourcing & Stock' }, { key: 'specs', label: 'Specifications' }, { key: 'bom', label: f.type === 'SPARE' ? 'Used in & Forecast' : 'BOM Spares' }, { key: 'media', label: 'Brochures & Media' }]

  return (
    <Drawer open={open} onClose={onClose} width="max-w-3xl"
      title={f.id ? `${f.sku} – ${f.shortName || f.name}` : 'New product'}
      subtitle={f.id ? <span className="flex items-center gap-2">{f.category} · {f.type === 'SPARE' ? 'Spare part' : 'Finished good'} <StatusBadge status={live?.active ? 'ACTIVE' : 'INACTIVE'} /></span> : 'Create a finished good or spare part'}
      footer={<>
        {live && <Button variant={live.active ? 'secondary' : 'success'} icon={Ban} onClick={toggle}>{live.active ? 'Deactivate' : 'Activate'}</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>{f.id ? 'Save changes' : 'Create product'}</Button>
      </>}>
      {live && (
        <div className="flex items-center gap-4 mb-4">
          <ProductImage product={live} size="lg" />
          <div className="grid grid-cols-3 gap-3 flex-1 text-sm">
            <div><div className="text-[11px] uppercase text-slate-400">On hand (Btali)</div><div className="font-bold text-lg">{fmtNum(onHand({ stock }, live.id))}</div></div>
            <div><div className="text-[11px] uppercase text-slate-400">Landed cost</div><div className="font-bold text-lg">{fmtINR(live.landedCost)}</div></div>
            <div><div className="text-[11px] uppercase text-slate-400">MRP</div><div className="font-bold text-lg">{fmtINR(live.mrp)}</div></div>
          </div>
        </div>
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />
      {tab === 'general' && (
        <FormGrid>
          <Field label="SKU" required><Input value={f.sku} onChange={(e) => set({ sku: e.target.value })} placeholder="BT-XX00" /></Field>
          <Field label="Category" required><Select value={f.category} options={CATS} onChange={(e) => { const c = e.target.value; set({ category: c, type: c === 'Spare Parts' ? 'SPARE' : 'FG', hsn: HSN[c], cartonQty: c === 'Spare Parts' ? 50 : f.cartonQty }) }} /></Field>
          <Field label="Product name" required className="md:col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Btali Monoblock Pump 1 HP" /></Field>
          <Field label="Short name"><Input value={f.shortName} onChange={(e) => set({ shortName: e.target.value })} /></Field>
          <Field label="Type"><Select value={f.type} options={[{ value: 'FG', label: 'Finished good' }, { value: 'SPARE', label: 'Spare part' }]} onChange={(e) => set({ type: e.target.value })} /></Field>
          <Field label="HSN code"><Input value={f.hsn} onChange={(e) => set({ hsn: e.target.value })} /></Field>
          <Field label="GST %"><Select value={String(f.gst)} options={['5', '12', '18', '28']} onChange={(e) => set({ gst: Number(e.target.value) })} /></Field>
          <Field label="UOM"><Select value={f.uom} options={['Nos', 'Set', 'Kit', 'Mtr']} onChange={(e) => set({ uom: e.target.value })} /></Field>
          <Field label="Warranty (months)"><NumberInput value={f.warrantyMonths} onChange={(v) => set({ warrantyMonths: v })} /></Field>
          <Field label="MRP (₹)" hint={`Formula: vendor rate × FX × ${mult} = ${fmtINR(sugMrp)}`}>
            <div className="flex gap-2"><NumberInput value={f.mrp} onChange={(v) => set({ mrp: v })} /><Button variant="secondary" size="sm" onClick={() => set({ mrp: sugMrp })}>Apply</Button></div>
          </Field>
          <Field label="Landed cost (₹)" hint="Updated automatically when landed cost is finalised"><NumberInput value={f.landedCost} onChange={(v) => set({ landedCost: v })} /></Field>
          <Field label="Description" className="md:col-span-2"><Textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        </FormGrid>
      )}
      {tab === 'sourcing' && (
        <FormGrid>
          <Field label="Primary vendor" required>
            <Combobox options={suppliers.map((v) => ({ value: v.id, label: v.name, sub: `${v.country} · ${v.currency}` }))} value={f.vendorId} onChange={(v) => { const ven = vendors.find((x) => x.id === v); set({ vendorId: v, currency: ven?.currency || 'USD', leadTimeDays: ven?.type === 'INDIA' ? 15 : 75, vendorIds: [...new Set([v, ...(f.vendorIds || [])])] }) }} />
          </Field>
          <Field label={`Vendor rate (${f.currency})`}><NumberInput step="0.01" value={f.vendorRate} onChange={(v) => set({ vendorRate: v })} /></Field>
          <div className="md:col-span-2"><div className="text-xs font-medium text-slate-600 mb-1">Alternate vendors</div>
            <div className="flex flex-wrap gap-2">
              {suppliers.map((v) => {
                const on = (f.vendorIds || []).includes(v.id)
                return (
                  <button key={v.id} type="button" disabled={v.id === f.vendorId} onClick={() => set({ vendorIds: on ? f.vendorIds.filter((x) => x !== v.id) : [...(f.vendorIds || []), v.id] })}
                    className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{v.code} · {v.name.split(' ').slice(0, 2).join(' ')}</button>
                )
              })}
            </div>
          </div>
          <Field label="MOQ"><NumberInput value={f.moq} onChange={(v) => set({ moq: v })} /></Field>
          <Field label="Lead time (days)"><NumberInput value={f.leadTimeDays} onChange={(v) => set({ leadTimeDays: v })} /></Field>
          <Field label="Reorder level"><NumberInput value={f.reorderLevel} onChange={(v) => set({ reorderLevel: v })} /></Field>
          <Field label="Max stock level"><NumberInput value={f.maxLevel} onChange={(v) => set({ maxLevel: v })} /></Field>
          <Field label="Weight (kg / unit)"><NumberInput step="0.01" value={f.weightKg} onChange={(v) => set({ weightKg: v })} /></Field>
          <Field label="Volume (CBM / unit)"><NumberInput step="0.0001" value={f.cbm} onChange={(v) => set({ cbm: v })} /></Field>
          <Field label="Carton qty" hint={f.type === 'SPARE' ? 'One barcode per carton for spares' : 'One barcode per unit'}><NumberInput value={f.cartonQty} onChange={(v) => set({ cartonQty: v })} /></Field>
          <Field label="BOQ / ordering note" className="md:col-span-2"><Textarea rows={2} value={f.boqNote || ''} onChange={(e) => set({ boqNote: e.target.value })} placeholder="e.g. Order with 2 spare seals per 10 pumps" /></Field>
        </FormGrid>
      )}
      {tab === 'specs' && (
        <div>
          <SectionTitle actions={<Button size="sm" variant="ghost" icon={Plus} onClick={() => setSpecRows((r) => [...r, { k: '', v: '' }])}>Add specification</Button>}>Technical specifications</SectionTitle>
          <div className="space-y-2">
            {specRows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input value={r.k} placeholder="Attribute (e.g. Power)" onChange={(e) => setSpecRows((rows) => rows.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
                <Input value={r.v} placeholder="Value (e.g. 1 HP)" onChange={(e) => setSpecRows((rows) => rows.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
                <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => setSpecRows((rows) => rows.filter((_, j) => j !== i))} />
              </div>
            ))}
            {!specRows.length && <div className="text-sm text-slate-400">No specifications yet.</div>}
          </div>
        </div>
      )}
      {tab === 'bom' && f.type === 'FG' && (
        <div>
          <SectionTitle actions={<Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ bom: [...(f.bom || []), { productId: '', qty: 1 }] })}>Map spare</Button>}>Spare parts in this product (BOM)</SectionTitle>
          <div className="space-y-2">
            {(f.bom || []).map((b, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Combobox className="flex-1" options={spareOpts} value={b.productId} onChange={(v) => set({ bom: f.bom.map((x, j) => (j === i ? { ...x, productId: v } : x)) })} placeholder="Select spare…" />
                <NumberInput className="w-24" min={1} value={b.qty} onChange={(v) => set({ bom: f.bom.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} />
                <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => set({ bom: f.bom.filter((_, j) => j !== i) })} />
              </div>
            ))}
            {!(f.bom || []).length && <div className="text-sm text-slate-400">No spares mapped. Mapped spares are forecast automatically from this product's demand.</div>}
          </div>
        </div>
      )}
      {tab === 'bom' && f.type === 'SPARE' && (
        !live ? <Alert tone="info">Save the spare first, then map it in the BOM of its parent products.</Alert> : (
          <div className="space-y-4">
            <Alert tone="info" title="Spare demand forecast">Derived from the seasonal forecast of every parent product × BOM quantity, plus direct spare sales.</Alert>
            <Grid cols={3}>
              <Stat label="3-month forecast" value={fmtNum(fc.total)} icon={TrendingUp} />
              <Stat label="Parent products" value={fc.rows.length} icon={Package} tone="ink" />
              <Stat label="On hand" value={fmtNum(onHand({ stock }, live.id))} icon={Boxes} tone="green" />
            </Grid>
            <BarsChart data={fc.months} money={false} stacked height={200} series={[{ key: 'derived', label: 'From parent products' }, { key: 'direct', label: 'Direct spare sales' }]} />
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Parent product</th><th className="text-right px-3 py-2">Qty / unit</th>{fc.months.map((m) => <th key={m.label} className="text-right px-3 py-2">{m.label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {fc.rows.map((r) => <tr key={r.id}><td className="px-3 py-2">{r.sku} – {r.name}</td><td className="px-3 py-2 text-right">{r.qtyPer}</td>{r.months.map((q, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{fmtNum(q)}</td>)}</tr>)}
                  {!fc.rows.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">Not mapped to any parent product.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
      {tab === 'media' && (
        <div className="space-y-3">
          <FileUpload onFiles={(atts) => { set({ media: [...(f.media || []), ...atts.map((a) => ({ ...a, kind: a.type.startsWith('image') ? 'image' : a.type.startsWith('video') ? 'video' : 'brochure' }))] }); toast.success(`${atts.length} file(s) added`, 'Save the product to keep them') }} label="Upload brochures, product photos or videos" hint="PDF, JPG, PNG, MP4" />
          <AttachmentList items={f.media || []} onRemove={(a) => set({ media: f.media.filter((m) => m.id !== a.id) })} empty="No brochures or media uploaded." />
        </div>
      )}
    </Drawer>
  )
}

export default function Products() {
  const products = useStore((s) => s.products)
  const vendors = useStore((s) => s.vendors)
  const stock = useStore((s) => s.stock)
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(null) // product or 'new'
  const id = params.get('id')
  useEffect(() => {
    if (id) { const p = products.find((x) => x.id === id); if (p) setEditing(p) }
  }, [id]) // eslint-disable-line
  const close = () => { setEditing(null); if (id) { params.delete('id'); setParams(params, { replace: true }) } }
  const vname = (vid) => vendors.find((v) => v.id === vid)?.name || '—'
  const rows = products
  const fg = products.filter((p) => p.type === 'FG')
  const cols = [
    { key: 'sku', header: 'Product', value: (r) => `${r.sku} ${r.shortName}`, render: (r) => <ProductCell product={r} /> },
    { key: 'category', header: 'Category' },
    { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'FG' ? 'ink' : 'gray'}>{r.type === 'FG' ? 'FG' : 'Spare'}</Badge> },
    { key: 'vendor', header: 'Vendor', value: (r) => vname(r.vendorId), render: (r) => <span className="text-xs whitespace-nowrap" title={vname(r.vendorId)}>{vname(r.vendorId).split(' ').slice(0, 2).join(' ')}{r.vendorIds?.length > 1 && <span className="text-slate-400"> +{r.vendorIds.length - 1}</span>}</span> },
    { key: 'vendorRate', header: 'Vendor rate', align: 'right', render: (r) => fmtMoney(r.vendorRate, r.currency) },
    { key: 'landedCost', header: 'Landed', align: 'right', render: (r) => fmtINR(r.landedCost) },
    { key: 'mrp', header: 'MRP', align: 'right', render: (r) => fmtINR(r.mrp) },
    { key: 'moq', header: 'MOQ', align: 'right', render: (r) => fmtNum(r.moq) },
    { key: 'reorderLevel', header: 'Reorder / Max', align: 'right', render: (r) => `${fmtNum(r.reorderLevel)} / ${fmtNum(r.maxLevel)}` },
    { key: 'oh', header: 'On hand', align: 'right', value: (r) => stock['WH-BTALI']?.[r.id] || 0, render: (r) => { const q = stock['WH-BTALI']?.[r.id] || 0; return <span className={q < r.reorderLevel ? 'text-red-600 font-semibold' : ''}>{fmtNum(q)}</span> } },
    { key: 'active', header: 'Status', value: (r) => (r.active ? 'Active' : 'Inactive'), render: (r) => <StatusBadge status={r.active ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'edit', header: '', sortable: false, export: false, render: (r) => <IconButton icon={Pencil} title="Edit" onClick={(e) => { e.stopPropagation(); setEditing(r) }} /> },
  ]
  return (
    <div>
      <PageHeader title="Products & Spares" subtitle="Central product master – vendors, MOQ, thresholds, BOQ, specifications and spare-part BOM"
        actions={<Button icon={Plus} onClick={() => setEditing('new')}>New product</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Finished goods" value={fg.length} icon={Package} sub={`${fg.filter((p) => p.active).length} active`} />
        <Stat label="Spare parts" value={products.length - fg.length} icon={Cog} tone="ink" sub={`${sum(fg, (p) => p.bom?.length || 0)} BOM links`} />
        <Stat label="Below reorder level" value={products.filter((p) => p.active && (stock['WH-BTALI']?.[p.id] || 0) < p.reorderLevel).length} icon={Boxes} tone="amber" />
        <Stat label="Inactive" value={products.filter((p) => !p.active).length} icon={Ban} tone="red" />
      </Grid>
      <DataTable rows={rows} columns={cols} onRowClick={(r) => setEditing(r)} exportName="btali-product-master" searchPlaceholder="Search SKU, name…"
        filters={[
          { key: 'category', label: 'categories', options: CATS },
          { key: 'type', label: 'types', options: [{ value: 'FG', label: 'Finished goods' }, { value: 'SPARE', label: 'Spares' }] },
          { key: 'vendorId', label: 'vendors', options: vendors.filter((v) => v.type === 'CHINA' || v.type === 'INDIA').map((v) => ({ value: v.id, label: v.name })) },
          { key: 'active', label: 'statuses', value: (r) => (r.active ? 'A' : 'I'), options: [{ value: 'A', label: 'Active' }, { value: 'I', label: 'Inactive' }] },
        ]} pageSize={15} />
      <ProductDrawer open={!!editing} product={editing === 'new' ? null : editing} onClose={close} />
    </div>
  )
}
