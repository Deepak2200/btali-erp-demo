import React, { useMemo, useState } from 'react'
import { Download, Tag, Calculator, CheckCircle2, XCircle, Layers } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, Tabs, Combobox, Field, NumberInput, Grid, Stat, ProductImage, toast } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { fmtINR, fmtDate, exportCSV, round2 } from '../../lib/format'
import { quotePrice, priceOrder, isSchemeLive } from '../../lib/pricing'
import { usePortal, usePricingState } from './_portal'

export default function Pricing() {
  const { partnerId, partner, isFranchise } = usePortal()
  const pstate = usePricingState()
  const addToCart = useStore((s) => s.addToCart)
  const [tab, setTab] = useState('list')
  const pl = pstate.priceLists.find((x) => x.id === partner?.priceListId)
  const cats = partner?.authorizedCategories?.length ? partner.authorizedCategories : [...new Set(pstate.products.map((p) => p.category))]

  const rows = useMemo(() => pstate.products.filter((p) => p.active && cats.includes(p.category)).map((p) => {
    const q = quotePrice(pstate, { productId: p.id, partnerId, qty: 1 })
    const schemePct = q.discounts.filter((d) => /^Scheme /.test(d.label)).reduce((a, d) => a + d.pct, 0)
    return { id: p.id, p, sku: p.sku, name: p.shortName, category: p.category, mrp: p.mrp, basePct: pl?.baseDiscountPct ?? 50, tierPct: partner?.extraDiscountPct || 0, schemePct, totalPct: q.totalDiscPct, net: q.unitPrice, gstNet: round2(q.unitPrice * 1.18), margin: round2(((p.mrp - q.unitPrice * 1.18) / p.mrp) * 100), slabs: (pl?.slabs || []).map((s) => quotePrice(pstate, { productId: p.id, partnerId, qty: s.minQty }).unitPrice) }
  }), [pstate, partnerId, pl, partner, cats]) // eslint-disable-line

  const schemes = (pstate.schemes || []).filter((s) => s.active || isSchemeLive(s))
  const eligible = (s) => {
    if (!isSchemeLive(s)) return { ok: false, why: s.to && s.to < new Date().toISOString().slice(0, 10) ? `Ended ${fmtDate(s.to)}` : 'Not active' }
    if (s.regions?.length && !s.regions.includes(partner?.region)) return { ok: false, why: `Only for ${s.regions.join(' & ')} region` }
    if (s.partnerIds?.length && !s.partnerIds.includes(partnerId)) return { ok: false, why: 'Selected partners only' }
    return { ok: true, why: `Valid till ${fmtDate(s.to)}` }
  }
  const pname = (id) => pstate.products.find((p) => p.id === id)?.shortName

  const download = () => {
    exportCSV(`Btali-Price-List-${partner?.code}-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      { header: 'SKU', value: (r) => r.sku }, { header: 'Product', value: (r) => r.name }, { header: 'Category', value: (r) => r.category }, { header: 'HSN', value: (r) => r.p.hsn },
      { header: 'MRP', value: (r) => r.mrp }, { header: 'Base disc %', value: (r) => r.basePct }, { header: 'Tier extra %', value: (r) => r.tierPct }, { header: 'Scheme %', value: (r) => r.schemePct },
      { header: 'Net price (excl GST)', value: (r) => r.net }, { header: 'Net incl GST', value: (r) => r.gstNet },
      ...(pl?.slabs || []).map((s, i) => ({ header: `${s.minQty}+ qty price`, value: (r) => r.slabs[i] })),
    ])
    toast.success('Price list downloaded', `${rows.length} products`)
  }

  return (
    <div>
      <PageHeader title="Pricing & schemes" subtitle={`${pl?.name || 'Price list'} v${pl?.version || 1}${pl?.publishedAt ? ` · published ${fmtDate(pl.publishedAt)}` : ''} · prices excl. GST`}
        actions={<Button icon={Download} onClick={download}>Download price list</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={Tag} label="Base discount" value={`${pl?.baseDiscountPct ?? 50}%`} sub={pl?.name} />
        <Stat icon={Layers} tone="ink" label={isFranchise ? 'Store tier' : `Tier ${partner?.tier} extra`} value={`${partner?.extraDiscountPct || 0}%`} />
        <Stat icon={Layers} tone="blue" label="Bulk slabs" value={(pl?.slabs || []).length ? `up to ${Math.max(...pl.slabs.map((s) => s.extraPct))}%` : '—'} sub={(pl?.slabs || []).map((s) => `${s.minQty}+`).join(' / ')} />
        <Stat icon={CheckCircle2} tone="green" label="Eligible schemes" value={schemes.filter((s) => eligible(s).ok).length} />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'list', label: 'My price list' }, { key: 'slabs', label: 'Bulk slabs' }, { key: 'schemes', label: 'Schemes', count: schemes.filter((s) => eligible(s).ok).length }, { key: 'sim', label: 'Price simulator' }]} />

      {tab === 'list' && (
        <DataTable rows={rows} pageSize={15} filters={[{ key: 'category', label: 'categories', options: cats }]} searchPlaceholder="Search SKU or product…"
          columns={[
            { key: 'name', header: 'Product', render: (r) => <div className="flex items-center gap-2 min-w-[200px]"><ProductImage product={r.p} size="sm" /><div><div className="font-medium text-slate-800">{r.name}</div><div className="text-[11px] text-slate-500">{r.sku} · {r.category}</div></div></div> },
            { key: 'mrp', header: 'MRP', align: 'right', render: (r) => <span className="tabular-nums">{fmtINR(r.mrp)}</span> },
            { key: 'basePct', header: 'Base', align: 'right', render: (r) => `${r.basePct}%` },
            { key: 'tierPct', header: 'Tier', align: 'right', render: (r) => (r.tierPct ? `${r.tierPct}%` : '—') },
            { key: 'schemePct', header: 'Scheme', align: 'right', render: (r) => (r.schemePct ? <Badge tone="brand">{r.schemePct}%</Badge> : '—') },
            { key: 'net', header: 'Net price', align: 'right', render: (r) => <span className="tabular-nums font-semibold">{fmtINR(r.net)}</span> },
            { key: 'gstNet', header: 'Incl. GST', align: 'right', render: (r) => <span className="tabular-nums text-slate-600">{fmtINR(r.gstNet)}</span> },
            { key: 'margin', header: 'Your margin at MRP', align: 'right', render: (r) => <span className="tabular-nums text-emerald-700">{r.margin}%</span> },
          ]} />
      )}

      {tab === 'slabs' && (
        <Card title="Bulk quantity slabs" subtitle="Extra discount applies per product line when the ordered quantity reaches the slab">
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2">Product</th><th className="text-right px-3 py-2">1+ qty</th>{(pl?.slabs || []).map((s) => <th key={s.minQty} className="text-right px-3 py-2">{s.minQty}+ qty <span className="text-emerald-600 normal-case">(−{s.extraPct}%)</span></th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => <tr key={r.id}><td className="px-4 py-2"><div className="font-medium">{r.name}</div><div className="text-[11px] text-slate-500">{r.sku}</div></td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(r.net)}</td>{r.slabs.map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{fmtINR(v)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {!(pl?.slabs || []).length && <div className="text-sm text-slate-500">Your price list has flat transfer pricing – no quantity slabs.</div>}
        </Card>
      )}

      {tab === 'schemes' && (
        <div className="grid md:grid-cols-2 gap-4">
          {schemes.map((s) => {
            const e = eligible(s)
            return (
              <Card key={s.id}>
                <div className="flex items-start justify-between gap-2">
                  <div><Badge tone={e.ok ? 'brand' : 'gray'}>{s.code}</Badge><div className="font-semibold text-slate-900 mt-2">{s.name}</div></div>
                  <Badge tone={e.ok ? 'green' : 'gray'}>{e.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{e.ok ? 'Eligible' : 'Not eligible'}</Badge>
                </div>
                <p className="text-sm text-slate-600 mt-1">{s.description}</p>
                <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                  <div><b className="text-slate-700">Type:</b> {s.type === 'SEASONAL' ? `Seasonal ${s.discountPct}% off` : s.type === 'SLAB' ? `Volume – extra ${s.extraPct}% on ${s.minQty}+ units` : s.type === 'COMBO' ? `Combo – ${s.comboDiscountPct}% off on ${(s.comboItems || []).map((c) => `${c.qty}× ${pname(c.productId)}`).join(' + ')}` : `Buy ${s.buyQty} ${pname(s.buyProductId)}, get ${s.freeQty} ${pname(s.freeProductId)} free`}</div>
                  {s.categories?.length > 0 && <div><b className="text-slate-700">Applies to:</b> {s.categories.join(', ')}</div>}
                  <div><b className="text-slate-700">Period:</b> {fmtDate(s.from)} – {fmtDate(s.to)} · {e.why}</div>
                </div>
                {e.ok && s.type === 'COMBO' && <Button size="sm" variant="soft" className="mt-3" onClick={() => { s.comboItems.forEach((c) => addToCart(partnerId, c.productId, c.qty)); toast.success('Combo added to cart', s.name) }}>Add combo to cart</Button>}
                {e.ok && s.type === 'BOGO' && <Button size="sm" variant="soft" className="mt-3" onClick={() => { addToCart(partnerId, s.buyProductId, s.buyQty); toast.success('Added to cart', `${s.buyQty} × ${pname(s.buyProductId)}`) }}>Add {s.buyQty} to cart</Button>}
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'sim' && <Simulator pstate={pstate} partnerId={partnerId} cats={cats} addToCart={addToCart} />}
    </div>
  )
}

function Simulator({ pstate, partnerId, cats, addToCart }) {
  const [pid, setPid] = useState('p16')
  const [qty, setQty] = useState(10)
  const p = pstate.products.find((x) => x.id === pid)
  const q = p ? quotePrice(pstate, { productId: pid, partnerId, qty: Number(qty) || 1 }) : null
  const ord = p ? priceOrder(pstate, partnerId, [{ productId: pid, qty: Number(qty) || 1 }]) : null
  const options = pstate.products.filter((x) => x.active && cats.includes(x.category)).map((x) => ({ value: x.id, label: `${x.sku} – ${x.shortName}`, sub: `MRP ${fmtINR(x.mrp)}` }))
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Simulate a purchase" subtitle="See exactly how your price is built for any quantity">
        <div className="space-y-3">
          <Field label="Product"><Combobox options={options} value={pid} onChange={setPid} /></Field>
          <Field label="Quantity"><NumberInput min={1} value={qty} onChange={setQty} /></Field>
          {p && <Button variant="soft" icon={Calculator} onClick={() => { addToCart(partnerId, pid, Number(qty) || 1); toast.success('Added to cart', `${p.shortName} × ${qty}`) }}>Add this to cart</Button>}
        </div>
      </Card>
      {q && (
        <Card title="Price build-up" subtitle={p.name}>
          <div className="divide-y divide-slate-100 text-sm">
            <div className="flex justify-between py-2"><span className="text-slate-500">MRP</span><span className="tabular-nums">{fmtINR(p.mrp)}</span></div>
            {q.discounts.map((d, i) => <div key={i} className="flex justify-between py-2"><span>{d.label}</span><span className="text-emerald-600 tabular-nums">{d.pct ? `−${d.pct}%` : '—'}</span></div>)}
            <div className="flex justify-between py-2 font-semibold"><span>Net unit price</span><span className="tabular-nums">{fmtINR(q.unitPrice)}</span></div>
            {ord.lines.filter((l) => l.free).map((l) => <div key={l.productId} className="flex justify-between py-2 text-violet-700"><span>Free: {pstate.products.find((x) => x.id === l.productId)?.shortName}</span><span>× {l.qty}</span></div>)}
            <div className="flex justify-between py-2"><span className="text-slate-500">Taxable ({qty} units)</span><span className="tabular-nums">{fmtINR(ord.subtotal)}</span></div>
            <div className="flex justify-between py-2"><span className="text-slate-500">GST 18%</span><span className="tabular-nums">{fmtINR(ord.gst)}</span></div>
            <div className="flex justify-between py-2 text-base font-bold"><span>Total payable</span><span className="tabular-nums">{fmtINR(ord.total)}</span></div>
          </div>
          <div className="mt-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2">Total discount {q.totalDiscPct}% · you save {fmtINR(round2((p.mrp - q.unitPrice) * (Number(qty) || 1)))} vs MRP</div>
        </Card>
      )}
    </div>
  )
}
