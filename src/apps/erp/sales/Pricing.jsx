import React, { useEffect, useMemo, useState } from 'react'
import { BadgePercent, Plus, Trash2, Save, Calculator, Layers, Users, Tag, Download } from 'lucide-react'
import { useStore } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Button, IconButton, Field, FormGrid, Input, NumberInput, Select, Combobox, Tabs, Badge, Alert, Modal, KV, toast, confirm,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell } from '../../../components/business'
import { quotePrice, priceOrder } from '../../../lib/pricing'
import { fmtINR, fmtDate, fmtPct, round2, exportCSV } from '../../../lib/format'
import { useScope, REGIONS } from './_shared'

function ListEditor({ pl, canManage }) {
  const state = useStore()
  const updatePriceList = useStore((s) => s.updatePriceList)
  const [base, setBase] = useState(pl.baseDiscountPct)
  const [margin, setMargin] = useState(pl.marginPct ?? 0)
  const [slabs, setSlabs] = useState(pl.slabs || [])
  const [overrides, setOverrides] = useState(pl.overrides || {})
  const [addPid, setAddPid] = useState('')
  useEffect(() => { setBase(pl.baseDiscountPct); setMargin(pl.marginPct ?? 0); setSlabs(pl.slabs || []); setOverrides(pl.overrides || {}) }, [pl.id, pl.version]) // eslint-disable-line
  const isExport = pl.kind === 'EXPORT'
  const dirty = base !== pl.baseDiscountPct || JSON.stringify(slabs) !== JSON.stringify(pl.slabs || []) || JSON.stringify(overrides) !== JSON.stringify(pl.overrides || {}) || (isExport && margin !== pl.marginPct)
  const dealers = state.partners.filter((p) => p.priceListId === pl.id)
  const publish = async () => {
    const sorted = [...slabs].filter((s) => Number(s.minQty) > 0).map((s) => ({ minQty: Number(s.minQty), extraPct: Number(s.extraPct) || 0 })).sort((a, b) => a.minQty - b.minQty)
    if (new Set(sorted.map((s) => s.minQty)).size !== sorted.length) return toast.error('Each slab needs a unique minimum quantity')
    if (!(await confirm({ title: `Publish ${pl.name} v${(pl.version || 1) + 1}?`, message: `${dealers.length} partners on this list will see the new prices immediately on the portal and in new orders.`, confirmText: 'Publish' }))) return
    const ov = Object.fromEntries(Object.entries(overrides).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]))
    updatePriceList(pl.id, { baseDiscountPct: Number(base) || 0, slabs: sorted, overrides: ov, ...(isExport ? { marginPct: Number(margin) || 0 } : {}) })
    toast.success(`${pl.name} published`, `${dealers.length} partners notified`)
  }
  const sample = state.products.filter((p) => p.active).slice(0, 40)
  const rows = sample.map((p) => {
    const net = overrides[p.id] ? Number(overrides[p.id]) : round2(p.mrp * (1 - (Number(base) || 0) / 100))
    const exp = isExport ? round2(p.vendorRate * (state.settings.fx[p.currency] || 1) * (1 + (Number(margin) || 0) / 100)) : null
    const price = isExport ? exp : net
    return { ...p, net: price, margin: round2(price - p.landedCost), marginPct: price ? round2(((price - p.landedCost) / price) * 100) : 0 }
  })
  const below = rows.filter((r) => r.marginPct < (state.settings.targetMarginPct ?? 12)).length
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat label="Version" value={`v${pl.version || 1}`} icon={Tag} tone="ink" sub={`published ${fmtDate(pl.publishedAt)}`} />
        <Stat label={isExport ? 'Export margin' : 'Base discount'} value={isExport ? `${pl.marginPct}%` : `${pl.baseDiscountPct}% off MRP`} icon={BadgePercent} tone="brand" />
        <Stat label="Partners on list" value={dealers.length} icon={Users} tone="blue" />
        <Stat label="SKUs below target margin" value={below} icon={Layers} tone={below ? 'red' : 'green'} sub={`target ${state.settings.targetMarginPct}%`} />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Discount policy" subtitle={pl.note} actions={canManage && <Button size="sm" icon={Save} disabled={!dirty} onClick={publish}>Publish v{(pl.version || 1) + 1}</Button>}>
          {isExport ? (
            <Field label="Margin over vendor cost (%)" hint="Export price = vendor rate × FX × (1 + margin)"><NumberInput value={margin} onChange={setMargin} disabled={!canManage} /></Field>
          ) : (
            <Field label="Base discount on MRP (%)" hint="Dealer net = MRP × (1 − base − dealer extra − slab − scheme)"><NumberInput value={base} onChange={setBase} disabled={!canManage} min={0} max={80} step="0.5" /></Field>
          )}
          {!isExport && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bulk quantity slabs</span>{canManage && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setSlabs([...slabs, { minQty: (slabs[slabs.length - 1]?.minQty || 0) + 25, extraPct: (slabs[slabs.length - 1]?.extraPct || 0) + 1 }])}>Add slab</Button>}</div>
              <div className="space-y-2">
                {slabs.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-10">Qty ≥</span>
                    <NumberInput value={s.minQty} disabled={!canManage} onChange={(v) => setSlabs(slabs.map((x, j) => (j === i ? { ...x, minQty: v } : x)))} className="w-24" />
                    <span className="text-xs text-slate-500">extra</span>
                    <NumberInput value={s.extraPct} step="0.5" disabled={!canManage} onChange={(v) => setSlabs(slabs.map((x, j) => (j === i ? { ...x, extraPct: v } : x)))} className="w-20" />
                    <span className="text-xs text-slate-500">%</span>
                    {canManage && <IconButton icon={Trash2} tone="danger" title="Remove slab" onClick={() => setSlabs(slabs.filter((_, j) => j !== i))} />}
                  </div>
                ))}
                {!slabs.length && <div className="text-sm text-slate-400">No volume slabs on this list.</div>}
              </div>
            </div>
          )}
          {dirty && <Alert tone="warn" className="mt-4">Unpublished changes – partners still see v{pl.version || 1}.</Alert>}
        </Card>
        <Card title="Product overrides" subtitle="Fixed special net rates that replace the base discount" className="lg:col-span-2">
          {canManage && !isExport && (
            <div className="flex gap-2 mb-3">
              <Combobox className="flex-1" value={addPid} onChange={setAddPid} placeholder="Add product override…" options={state.products.filter((p) => !overrides[p.id]).map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: `MRP ${fmtINR(p.mrp)}` }))} />
              <Button variant="secondary" icon={Plus} disabled={!addPid} onClick={() => { const p = state.products.find((x) => x.id === addPid); setOverrides({ ...overrides, [addPid]: round2(p.mrp * (1 - (Number(base) + 2) / 100)) }); setAddPid('') }}>Add</Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-slate-400"><tr><th className="text-left py-1.5">Product</th><th className="text-right px-2">MRP</th><th className="text-right px-2">List net</th><th className="text-right px-2">Override</th><th className="text-right px-2">Margin</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {Object.keys(overrides).map((pid) => {
                  const p = state.products.find((x) => x.id === pid)
                  if (!p) return null
                  const v = Number(overrides[pid]) || 0
                  const m = v ? ((v - p.landedCost) / v) * 100 : 0
                  return (
                    <tr key={pid}>
                      <td className="py-1.5"><ProductCell product={p} size="xs" /></td>
                      <td className="px-2 text-right tabular-nums">{fmtINR(p.mrp)}</td>
                      <td className="px-2 text-right tabular-nums text-slate-500">{fmtINR(p.mrp * (1 - base / 100))}</td>
                      <td className="px-2 text-right"><NumberInput value={overrides[pid]} disabled={!canManage} onChange={(val) => setOverrides({ ...overrides, [pid]: val })} className="w-28 text-right ml-auto" /></td>
                      <td className={`px-2 text-right tabular-nums ${m < state.settings.targetMarginPct ? 'text-red-600' : 'text-emerald-700'}`}>{fmtPct(m)}</td>
                      <td>{canManage && <IconButton icon={Trash2} tone="danger" title="Remove override" onClick={() => { const n = { ...overrides }; delete n[pid]; setOverrides(n) }} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!Object.keys(overrides).length && <div className="text-sm text-slate-400 py-4 text-center">No product overrides – every SKU follows the list discount.</div>}
          </div>
        </Card>
      </div>
      <DataTable
        exportName={`price-list-${pl.name.replace(/\s+/g, '-').toLowerCase()}`}
        rows={rows}
        pageSize={10}
        filters={[{ key: 'category', label: 'categories', options: [...new Set(rows.map((r) => r.category))] }]}
        columns={[
          { key: 'sku', header: 'Product', value: (r) => r.sku, render: (r) => <ProductCell product={r} /> },
          { key: 'category', header: 'Category' },
          { key: 'landedCost', header: 'Landed cost', align: 'right', render: (r) => fmtINR(r.landedCost) },
          { key: 'mrp', header: 'MRP', align: 'right', render: (r) => fmtINR(r.mrp) },
          { key: 'net', header: isExport ? 'Export price (₹)' : 'Dealer net', align: 'right', render: (r) => <span className="font-semibold">{fmtINR(r.net)}</span> },
          { key: 'marginPct', header: 'Margin %', align: 'right', render: (r) => <span className={r.marginPct < state.settings.targetMarginPct ? 'text-red-600 font-medium' : 'text-emerald-700'}>{fmtPct(r.marginPct)}</span> },
        ]}
      />
    </div>
  )
}

function AssignmentMatrix({ canManage, scope }) {
  const state = useStore()
  const assignPriceList = useStore((s) => s.assignPriceList)
  const updatePartnerProfile = useStore((s) => s.updatePartnerProfile)
  const rows = state.partners.filter((p) => p.status === 'ACTIVE' && scope.inScope(p.id))
  const pls = state.priceLists
  return (
    <DataTable
      rows={rows}
      exportName="dealer-price-list-assignment"
      filters={[{ key: 'region', label: 'regions', options: [...REGIONS, 'Export'] }, { key: 'type', label: 'types', options: ['DEALER', 'FRANCHISE', 'EXPORT'] }, { key: 'priceListId', label: 'price lists', options: pls.map((p) => ({ value: p.id, label: p.name })) }]}
      columns={[
        { key: 'name', header: 'Partner', render: (p) => <div><div className="font-medium text-slate-800">{p.name}</div><div className="text-[11px] text-slate-500">{p.code} · {p.city}</div></div> },
        { key: 'tier', header: 'Tier', render: (p) => (p.tier ? <Badge tone={p.tier === 'A' ? 'brand' : 'gray'}>{p.tier}</Badge> : '—') },
        { key: 'region', header: 'Region' },
        ...pls.map((pl) => ({
          key: pl.id, header: pl.name, sortable: false, align: 'center', value: (p) => (p.priceListId === pl.id ? 'Yes' : ''),
          render: (p) => (
            <input type="radio" name={`pl-${p.id}`} checked={p.priceListId === pl.id} disabled={!canManage} className="w-4 h-4 accent-[#f2541f] cursor-pointer disabled:cursor-not-allowed"
              onChange={() => { assignPriceList(p.id, pl.id); toast.success(`${p.name} → ${pl.name}`) }} />
          ),
        })),
        { key: 'extraDiscountPct', header: 'Extra %', align: 'right', render: (p) => (
          canManage && p.type === 'DEALER' ? <NumberInput value={p.extraDiscountPct || 0} min={0} max={10} step="0.5" className="w-20 text-right ml-auto py-1" onChange={(v) => updatePartnerProfile(p.id, { extraDiscountPct: Number(v) || 0 })} /> : `${p.extraDiscountPct || 0}%`
        ) },
      ]}
    />
  )
}

function Simulator({ scope }) {
  const state = useStore()
  const [partnerId, setPartnerId] = useState('d2')
  const [productId, setProductId] = useState('p16')
  const [qty, setQty] = useState(10)
  const q = useMemo(() => (partnerId && productId ? quotePrice(state, { productId, partnerId, qty: Number(qty) || 1 }) : null), [state, partnerId, productId, qty])
  const order = useMemo(() => (partnerId && productId ? priceOrder(state, partnerId, [{ productId, qty: Number(qty) || 1 }]) : null), [state, partnerId, productId, qty])
  const product = state.products.find((p) => p.id === productId)
  const partner = state.partners.find((p) => p.id === partnerId)
  const line = order?.lines[0]
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="Simulate a price" subtitle="Exactly what the order engine will charge">
        <div className="space-y-3">
          <Field label="Dealer"><Combobox value={partnerId} onChange={setPartnerId} options={state.partners.filter((p) => p.status === 'ACTIVE' && scope.inScope(p.id)).map((p) => ({ value: p.id, label: p.name, sub: `${p.city} · ${state.priceLists.find((x) => x.id === p.priceListId)?.name}` }))} /></Field>
          <Field label="Product"><Combobox value={productId} onChange={setProductId} options={state.products.map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: `${p.category} · MRP ${fmtINR(p.mrp)}` }))} /></Field>
          <Field label="Quantity"><NumberInput value={qty} min={1} onChange={setQty} /></Field>
          <div className="flex flex-wrap gap-1.5">{[1, 10, 25, 30, 50, 100].map((n) => <Button key={n} size="sm" variant={Number(qty) === n ? 'soft' : 'ghost'} onClick={() => setQty(n)}>{n}</Button>)}</div>
        </div>
      </Card>
      <Card title="Discount waterfall" className="lg:col-span-2" actions={q && <Button size="sm" variant="secondary" icon={Download} onClick={() => exportCSV(`price-simulation-${product?.sku}.csv`, [{ label: 'MRP', pct: '', value: q.mrp }, ...q.discounts.map((d) => ({ label: d.label, pct: d.pct, value: '' })), { label: 'Net unit price', pct: q.totalDiscPct, value: q.unitPrice }], [{ key: 'label', header: 'Step' }, { key: 'pct', header: 'Discount %' }, { key: 'value', header: 'Value (INR)' }])}>Export</Button>}>
        {q && product && partner ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <ProductCell product={product} />
              <Badge tone="ink">{state.priceLists.find((x) => x.id === partner.priceListId)?.name}</Badge>
              <Badge>{partner.region}</Badge>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-slate-600">MRP</span><span className="tabular-nums font-medium">{fmtINR(q.mrp)}</span></div>
              {q.discounts.map((d, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-slate-600 flex-1">{d.label}</span>
                  {d.pct > 0 && <div className="hidden sm:block w-40 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-brand-400" style={{ width: `${Math.min(100, d.pct * 1.6)}%` }} /></div>}
                  <span className="tabular-nums text-brand-700 w-16 text-right">{d.pct ? `−${d.pct}%` : ''}</span>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold"><span>Net unit price</span><span className="tabular-nums">{fmtINR(q.unitPrice, true)}</span></div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 p-3"><KV label="Total discount" value={`${q.totalDiscPct}%`} /></div>
              <div className="rounded-lg bg-slate-50 p-3"><KV label={`Line value (${qty})`} value={fmtINR(line?.amount)} /></div>
              <div className="rounded-lg bg-slate-50 p-3"><KV label="Margin / unit" value={<span className={q.unitPrice - product.landedCost < 0 ? 'text-red-600' : 'text-emerald-700'}>{fmtINR(q.unitPrice - product.landedCost)}</span>} /></div>
            </div>
            {order.lines.filter((l) => l.free).map((l, i) => <Alert key={i} tone="success">BOGO: {l.qty} × {state.products.find((p) => p.id === l.productId)?.shortName} free with this quantity.</Alert>)}
            {line?.discounts?.some((d) => /Combo/.test(d.label)) && <Alert tone="success">Combo discount applies on this order.</Alert>}
          </div>
        ) : <div className="text-sm text-slate-400">Select dealer and product.</div>}
      </Card>
    </div>
  )
}

export default function Pricing() {
  const state = useStore()
  const scope = useScope()
  const [tab, setTab] = useState('pl1')
  const pl = state.priceLists.find((p) => p.id === tab)
  return (
    <div>
      <PageHeader title="Price Lists & Discounts" subtitle="Dealer-specific price lists, bulk slabs and overrides – applied automatically in every order and on the Dealer Portal"
        actions={!scope.canManage ? <Badge tone="amber">View only – changes by Sales Manager</Badge> : null} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        ...state.priceLists.map((p) => ({ key: p.id, label: p.name, count: state.partners.filter((x) => x.priceListId === p.id && x.status === 'ACTIVE').length })),
        { key: 'matrix', label: 'Dealer assignment' },
        { key: 'sim', label: <span className="inline-flex items-center gap-1"><Calculator className="w-3.5 h-3.5" />Price simulator</span> },
      ]} />
      {pl && <ListEditor pl={pl} canManage={scope.canManage} />}
      {tab === 'matrix' && <AssignmentMatrix canManage={scope.canManage} scope={scope} />}
      {tab === 'sim' && <Simulator scope={scope} />}
    </div>
  )
}
