import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, FileDown, Plus, Minus, Tag, Info, Wrench, ShieldCheck, LayoutGrid, List } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, Drawer, ProductImage, SearchInput, Select, EmptyState, DescriptionList, SectionTitle, Segmented, toast, cx } from '../../components/ui'
import { fmtINR, fmtNum } from '../../lib/format'
import { quotePrice, isSchemeLive } from '../../lib/pricing'
import { usePortal, usePricingState, useStockState, availability, AvailabilityBadge, downloadBrochure } from './_portal'

function QtyStepper({ value, onChange, min = 1 }) {
  return (
    <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
      <button type="button" aria-label="Decrease" className="px-2 py-1.5 text-slate-500 hover:bg-slate-50" onClick={() => onChange(Math.max(min, (Number(value) || min) - 1))}><Minus className="w-3.5 h-3.5" /></button>
      <input value={value} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/\D/g, '') === '' ? '' : Number(e.target.value.replace(/\D/g, '')))} onBlur={() => !value && onChange(min)}
        className="w-11 text-center text-sm tabular-nums focus:outline-none py-1" />
      <button type="button" aria-label="Increase" className="px-2 py-1.5 text-slate-500 hover:bg-slate-50" onClick={() => onChange((Number(value) || 0) + 1)}><Plus className="w-3.5 h-3.5" /></button>
    </div>
  )
}

export default function Catalog() {
  const nav = useNavigate()
  const { partnerId, partner, base, isFranchise } = usePortal()
  const pstate = usePricingState()
  const sst = useStockState()
  const company = useStore((s) => s.settings.company)
  const cart = useStore((s) => s.carts?.[partnerId] || [])
  const addToCart = useStore((s) => s.addToCart)
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [avail, setAvail] = useState('all')
  const [sort, setSort] = useState('popular')
  const [view, setView] = useState('grid')
  const [qty, setQty] = useState({})
  const [open, setOpen] = useState(null)

  const cats = partner?.authorizedCategories?.length ? partner.authorizedCategories : [...new Set(pstate.products.map((p) => p.category))]
  const pl = pstate.priceLists.find((x) => x.id === partner?.priceListId)

  const items = useMemo(() => {
    let list = pstate.products.filter((p) => p.active && cats.includes(p.category))
    if (cat) list = list.filter((p) => p.category === cat)
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter((p) => `${p.name} ${p.sku} ${p.category} ${Object.values(p.specs || {}).join(' ')}`.toLowerCase().includes(s))
    }
    let rows = list.map((p) => ({ p, quote: quotePrice(pstate, { productId: p.id, partnerId, qty: 1 }), a: availability(sst, p) }))
    if (avail === 'stock') rows = rows.filter((r) => r.a.free > 0)
    if (avail === 'scheme') rows = rows.filter((r) => r.quote.schemeIds.length || (pstate.schemes || []).some((s) => isSchemeLive(s) && (s.productIds || []).includes(r.p.id)))
    const sorters = { popular: (a, b) => b.p.popularity - a.p.popularity, priceAsc: (a, b) => a.quote.unitPrice - b.quote.unitPrice, priceDesc: (a, b) => b.quote.unitPrice - a.quote.unitPrice, name: (a, b) => a.p.name.localeCompare(b.p.name) }
    return rows.sort(sorters[sort])
  }, [pstate, sst, partnerId, cat, q, avail, sort, cats])

  const add = (p, n) => {
    const v = Number(n ?? qty[p.id] ?? 1) || 1
    addToCart(partnerId, p.id, v)
    toast.success('Added to cart', `${p.shortName} × ${v}`)
  }
  const liveSchemesFor = (p) => (pstate.schemes || []).filter((s) => isSchemeLive(s) && ((s.productIds || []).includes(p.id) || (s.categories || []).includes(p.category)) && (!s.regions?.length || s.regions.includes(partner?.region)))
  const cartCount = cart.length
  const sel = open ? pstate.products.find((p) => p.id === open) : null

  return (
    <div>
      <PageHeader title="Product catalog" subtitle={`${items.length} products · ${isFranchise ? 'store transfer' : 'your'} prices from ${pl?.name || 'price list'}${pl?.version ? ` v${pl.version}` : ''}`}
        actions={<Button icon={ShoppingCart} onClick={() => nav(`${base}/cart`)}>Cart{cartCount ? ` (${cartCount})` : ''}</Button>} />

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3 -mx-1 px-1">
        {['', ...cats].map((c) => (
          <button key={c || 'all'} type="button" onClick={() => setCat(c)}
            className={cx('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors', cat === c ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
            {c || 'All products'}
          </button>
        ))}
      </div>
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Search by name, model or spec (e.g. 1 HP, 150 bar)…" className="md:max-w-md flex-1" />
        <div className="flex gap-2 flex-wrap">
          <Segmented size="sm" value={avail} onChange={setAvail} options={[{ key: 'all', label: 'All' }, { key: 'stock', label: 'In stock' }, { key: 'scheme', label: 'On scheme' }]} />
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-44" options={[{ value: 'popular', label: 'Best sellers' }, { value: 'priceAsc', label: 'Price: low to high' }, { value: 'priceDesc', label: 'Price: high to low' }, { value: 'name', label: 'Name A–Z' }]} />
          <div className="hidden sm:block"><Segmented size="sm" value={view} onChange={setView} options={[{ key: 'grid', label: <LayoutGrid className="w-4 h-4" /> }, { key: 'list', label: <List className="w-4 h-4" /> }]} /></div>
        </div>
      </div>

      {items.length === 0 ? <Card><EmptyState title="No products match" message="Try another category or clear the search." action={<Button variant="secondary" onClick={() => { setQ(''); setCat(''); setAvail('all') }}>Clear filters</Button>} /></Card> : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {items.map(({ p, quote, a }) => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden flex flex-col">
              <button type="button" onClick={() => setOpen(p.id)} className="relative block text-left">
                <ProductImage product={p} size="xl" className="rounded-none !aspect-[16/9]" />
                {quote.schemeIds.length > 0 && <span className="absolute top-2 left-2"><Badge tone="brand"><Tag className="w-3 h-3" />Scheme</Badge></span>}
              </button>
              <div className="p-3 flex flex-col flex-1">
                <div className="text-[11px] text-slate-500">{p.sku} · {p.category}</div>
                <button type="button" onClick={() => setOpen(p.id)} className="text-left text-sm font-semibold text-slate-900 hover:text-brand-600 line-clamp-2 min-h-[2.5rem]">{p.shortName}</button>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-slate-400">MRP <span className="line-through">{fmtINR(p.mrp)}</span></div>
                    <div className="text-lg font-bold text-ink-900 tabular-nums leading-tight">{fmtINR(quote.unitPrice)}</div>
                    <div className="text-[11px] text-emerald-600 font-medium">{quote.totalDiscPct}% off MRP · +GST</div>
                  </div>
                  <AvailabilityBadge a={a} />
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 mt-auto">
                  <QtyStepper value={qty[p.id] ?? (p.type === 'SPARE' ? 10 : 1)} onChange={(v) => setQty((s) => ({ ...s, [p.id]: v }))} />
                  <Button className="flex-1" icon={ShoppingCart} onClick={() => add(p, qty[p.id] ?? (p.type === 'SPARE' ? 10 : 1))}>Add</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card padded={false}>
          <div className="divide-y divide-slate-100">
            {items.map(({ p, quote, a }) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <ProductImage product={p} size="md" />
                <div className="flex-1 min-w-0">
                  <button type="button" onClick={() => setOpen(p.id)} className="text-sm font-semibold text-slate-900 hover:text-brand-600 text-left">{p.shortName}</button>
                  <div className="text-[11px] text-slate-500">{p.sku} · {p.category} · MRP {fmtINR(p.mrp)}</div>
                </div>
                <AvailabilityBadge a={a} />
                <div className="text-right w-28"><div className="font-bold tabular-nums">{fmtINR(quote.unitPrice)}</div><div className="text-[11px] text-emerald-600">{quote.totalDiscPct}% off</div></div>
                <QtyStepper value={qty[p.id] ?? (p.type === 'SPARE' ? 10 : 1)} onChange={(v) => setQty((s) => ({ ...s, [p.id]: v }))} />
                <Button size="sm" icon={ShoppingCart} onClick={() => add(p, qty[p.id] ?? (p.type === 'SPARE' ? 10 : 1))}>Add</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Drawer open={!!sel} onClose={() => setOpen(null)} title={sel?.name} subtitle={sel && `${sel.sku} · ${sel.category} · HSN ${sel.hsn}`}
        footer={sel && <>
          <Button variant="secondary" icon={FileDown} onClick={() => { downloadBrochure(sel, company); toast.success('Brochure downloaded', `${sel.sku}-brochure.html`) }}>Brochure</Button>
          <QtyStepper value={qty[sel.id] ?? (sel.type === 'SPARE' ? 10 : 1)} onChange={(v) => setQty((s) => ({ ...s, [sel.id]: v }))} />
          <Button icon={ShoppingCart} onClick={() => add(sel, qty[sel.id] ?? (sel.type === 'SPARE' ? 10 : 1))}>Add to cart</Button>
        </>}>
        {sel && <ProductDetail p={sel} partnerId={partnerId} pstate={pstate} sst={sst} schemes={liveSchemesFor(sel)} onAdd={add} onOpen={setOpen} />}
      </Drawer>
    </div>
  )
}

function ProductDetail({ p, partnerId, pstate, sst, schemes, onAdd, onOpen }) {
  const quote = quotePrice(pstate, { productId: p.id, partnerId, qty: 1 })
  const partner = pstate.partners.find((x) => x.id === partnerId)
  const pl = pstate.priceLists.find((x) => x.id === partner?.priceListId)
  const a = availability(sst, p)
  const slabs = (pl?.slabs || []).map((s) => ({ ...s, price: quotePrice(pstate, { productId: p.id, partnerId, qty: s.minQty }).unitPrice }))
  const spares = (p.bom || []).map((b) => pstate.products.find((x) => x.id === b.productId)).filter(Boolean)
  const fits = (p.parents || []).map((id) => pstate.products.find((x) => x.id === id)).filter(Boolean)
  return (
    <div className="space-y-5">
      <ProductImage product={p} size="xl" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">Your net price (per unit, excl. GST)</div>
          <div className="text-2xl font-bold text-ink-900 tabular-nums">{fmtINR(quote.unitPrice)}</div>
          <div className="text-xs text-slate-500">MRP {fmtINR(p.mrp)} · {quote.totalDiscPct}% total discount</div>
        </div>
        <AvailabilityBadge a={a} />
      </div>
      <p className="text-sm text-slate-600">{p.description}</p>
      <div>
        <SectionTitle>Price build-up</SectionTitle>
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-sm">
          <div className="flex justify-between px-3 py-2"><span className="text-slate-500">MRP</span><span className="tabular-nums">{fmtINR(p.mrp)}</span></div>
          {quote.discounts.map((d, i) => <div key={i} className="flex justify-between px-3 py-2"><span className="text-slate-600">{d.label}</span><span className="tabular-nums text-emerald-600">{d.pct ? `−${d.pct}%` : '—'}</span></div>)}
          <div className="flex justify-between px-3 py-2 font-semibold bg-slate-50"><span>Net price</span><span className="tabular-nums">{fmtINR(quote.unitPrice)}</span></div>
        </div>
      </div>
      {slabs.length > 0 && (
        <div>
          <SectionTitle>Bulk slabs</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {slabs.map((s) => <div key={s.minQty} className="rounded-lg border border-slate-200 p-2 text-center"><div className="text-[11px] text-slate-500">{s.minQty}+ units</div><div className="font-bold tabular-nums text-sm">{fmtINR(s.price)}</div><div className="text-[11px] text-emerald-600">extra {s.extraPct}%</div></div>)}
          </div>
        </div>
      )}
      {schemes.length > 0 && (
        <div>
          <SectionTitle>Live schemes</SectionTitle>
          <div className="space-y-2">{schemes.map((s) => <div key={s.id} className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-2 text-sm"><div className="font-semibold text-brand-800 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />{s.name}</div><div className="text-xs text-brand-900/80">{s.description}</div></div>)}</div>
        </div>
      )}
      <div>
        <SectionTitle>Technical specifications</SectionTitle>
        <DescriptionList cols={2} items={[...Object.entries(p.specs || {}), ['Warranty', `${p.warrantyMonths} months`], ['Pack', p.type === 'SPARE' ? `Carton of ${p.cartonQty}` : '1 unit per box'], ['Weight', `${p.weightKg} kg`], ['GST', `${p.gst}%`]]} />
      </div>
      {spares.length > 0 && (
        <div>
          <SectionTitle><span className="inline-flex items-center gap-1"><Wrench className="w-3.5 h-3.5" />Genuine spares for this model</span></SectionTitle>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {spares.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                <ProductImage product={s} size="sm" />
                <button type="button" onClick={() => onOpen(s.id)} className="flex-1 min-w-0 text-left"><div className="text-sm font-medium text-slate-800 truncate hover:text-brand-600">{s.shortName}</div><div className="text-[11px] text-slate-500">{s.sku} · {fmtINR(quotePrice(pstate, { productId: s.id, partnerId, qty: 10 }).unitPrice)} / unit</div></button>
                <Button size="sm" variant="soft" icon={Plus} onClick={() => onAdd(s, 10)}>10</Button>
              </div>
            ))}
          </div>
        </div>
      )}
      {fits.length > 0 && (
        <div>
          <SectionTitle><span className="inline-flex items-center gap-1"><Info className="w-3.5 h-3.5" />Compatible with</span></SectionTitle>
          <div className="flex flex-wrap gap-2">{fits.map((f) => <button key={f.id} type="button" onClick={() => onOpen(f.id)} className="px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-700 hover:bg-slate-200">{f.sku} · {f.shortName}</button>)}</div>
        </div>
      )}
      <div className="text-xs text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />Every unit carries a unique Btali barcode for warranty registration. Free stock at Btali warehouse: {fmtNum(a.free)} units.</div>
    </div>
  )
}
