import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ShoppingCart, FileDown, Plus, Minus, Tag, Info, Wrench, ShieldCheck, LayoutGrid, List, Bell, BellRing, PlayCircle, Repeat, Package, Search, CalendarClock, X, Sparkles } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, Drawer, Modal, ProductImage, SearchInput, Select, EmptyState, DescriptionList, SectionTitle, Segmented, Combobox, Alert, toast, cx } from '../../components/ui'
import { fmtINR, fmtNum, fmtDate, timeAgo } from '../../lib/format'
import { quotePrice, isSchemeLive } from '../../lib/pricing'
import { usePortal, usePricingState, useStockState, availability, AvailabilityBadge, downloadBrochure, alternativesFor, freeLabel } from './_portal'

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

/** "Notify me when back in stock" for one product */
function useStockAlerts(partnerId) {
  const alerts = useStore((s) => s.stockAlerts || [])
  const request = useStore((s) => s.requestStockAlert)
  const cancel = useStore((s) => s.cancelStockAlert)
  const mine = alerts.filter((a) => a.partnerId === partnerId)
  const active = (productId) => mine.find((a) => a.productId === productId && a.status === 'ACTIVE')
  const ask = (p, qty) => {
    const r = request(partnerId, p.id, qty)
    if (r.ok) toast.success('We will notify you', `You'll get a portal alert and email when ${p.shortName} is back in stock`)
    else toast.info(r.error)
  }
  return { mine, active, ask, cancel }
}
function NotifyButton({ p, alerts, qty, size = 'sm', className }) {
  const enabled = useStore((s) => s.settings.dealerPortal?.allowStockAlerts !== false)
  const on = alerts.active(p.id)
  if (!enabled) return null
  if (on) return <Button size={size} variant="secondary" icon={BellRing} className={className} onClick={() => { alerts.cancel(on.id); toast.info('Stock alert removed', p.shortName) }}>Alert set · remove</Button>
  return <Button size={size} variant="soft" icon={Bell} className={className} onClick={() => alerts.ask(p, qty)}>Notify me</Button>
}

export default function Catalog() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { partnerId, partner, base, isFranchise } = usePortal()
  const pstate = usePricingState()
  const sst = useStockState()
  const company = useStore((s) => s.settings.company)
  const cart = useStore((s) => s.carts?.[partnerId] || [])
  const addToCart = useStore((s) => s.addToCart)
  const alerts = useStockAlerts(partnerId)
  const [mode, setMode] = useState(sp.get('view') === 'spares' ? 'spares' : 'products')
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [avail, setAvail] = useState('all')
  const [sort, setSort] = useState('popular')
  const [view, setView] = useState('grid')
  const [qty, setQty] = useState({})
  const [open, setOpen] = useState(null)
  const [alertsOpen, setAlertsOpen] = useState(false)

  const cats = partner?.authorizedCategories?.length ? partner.authorizedCategories : [...new Set(pstate.products.map((p) => p.category))]
  const pl = pstate.priceLists.find((x) => x.id === partner?.priceListId)

  const items = useMemo(() => {
    let list = pstate.products.filter((p) => p.active && cats.includes(p.category))
    if (cat) list = list.filter((p) => p.category === cat)
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter((p) => `${p.name} ${p.sku} ${p.category} ${Object.values(p.specs || {}).join(' ')} ${(p.uses || []).join(' ')} ${(p.interchange || []).map((x) => x.code || '').join(' ')}`.toLowerCase().includes(s))
    }
    let rows = list.map((p) => ({ p, quote: quotePrice(pstate, { productId: p.id, partnerId, qty: 1 }), a: availability(sst, p) }))
    if (avail === 'stock') rows = rows.filter((r) => r.a.free > 0)
    if (avail === 'unavailable') rows = rows.filter((r) => r.a.free <= 0)
    if (avail === 'scheme') rows = rows.filter((r) => r.quote.schemeIds.length || (pstate.schemes || []).some((s) => isSchemeLive(s) && (s.productIds || []).includes(r.p.id)))
    const sorters = { popular: (a, b) => b.p.popularity - a.p.popularity, priceAsc: (a, b) => a.quote.unitPrice - b.quote.unitPrice, priceDesc: (a, b) => b.quote.unitPrice - a.quote.unitPrice, name: (a, b) => a.p.name.localeCompare(b.p.name) }
    return rows.sort(sorters[sort])
  }, [pstate, sst, partnerId, cat, q, avail, sort, cats])

  const defQty = (p) => qty[p.id] ?? (p.type === 'SPARE' ? 10 : 1)
  const add = (p, n) => {
    const v = Number(n ?? defQty(p)) || 1
    addToCart(partnerId, p.id, v)
    toast.success('Added to cart', `${p.shortName} × ${v}`)
  }
  const addKit = (kit, sets = 1) => {
    kit.items.forEach((i) => addToCart(partnerId, i.productId, i.qty * sets))
    toast.success('Kit added to cart', `${kit.name} (${kit.code}) × ${sets}`)
  }
  const liveSchemesFor = (p) => (pstate.schemes || []).filter((s) => isSchemeLive(s) && ((s.productIds || []).includes(p.id) || (s.categories || []).includes(p.category)) && (!s.regions?.length || s.regions.includes(partner?.region)))
  const sel = open ? pstate.products.find((p) => p.id === open) : null
  const activeAlerts = alerts.mine.filter((a) => a.status === 'ACTIVE')

  return (
    <div>
      <PageHeader title="Products & spare parts" subtitle={`${isFranchise ? 'Store transfer' : 'Your'} prices from ${pl?.name || 'price list'}${pl?.version ? ` v${pl.version}` : ''} · availability at Btali warehouse${sst.display === 'QUANTITY' ? ' with free quantities' : ''}`}
        actions={<>
          <Button variant="secondary" icon={Bell} onClick={() => setAlertsOpen(true)}>Stock alerts{activeAlerts.length ? ` (${activeAlerts.length})` : ''}</Button>
          <Button icon={ShoppingCart} onClick={() => nav(`${base}/cart`)}>Cart{cart.length ? ` (${cart.length})` : ''}</Button>
        </>} />

      <div className="mb-1"><Segmented value={mode} onChange={setMode} options={[{ key: 'products', label: 'Product catalog' }, { key: 'spares', label: 'Spare-parts finder' }]} /></div>

      {mode === 'spares' ? (
        <SparesFinder pstate={pstate} sst={sst} partnerId={partnerId} onOpen={setOpen} onAdd={add} onAddKit={addKit} alerts={alerts} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3 -mx-1 px-1 mt-3">
            {['', ...cats].map((c) => (
              <button key={c || 'all'} type="button" onClick={() => setCat(c)}
                className={cx('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors', cat === c ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
                {c || 'All products'}
              </button>
            ))}
          </div>
          <div className="flex flex-col md:flex-row gap-2 mb-4">
            <SearchInput value={q} onChange={setQ} placeholder="Search name, model, spec or use (e.g. 1 HP, car wash)…" className="md:max-w-md flex-1" />
            <div className="flex gap-2 flex-wrap">
              <Segmented size="sm" value={avail} onChange={setAvail} options={[{ key: 'all', label: 'All' }, { key: 'stock', label: 'Available' }, { key: 'unavailable', label: 'Unavailable' }, { key: 'scheme', label: 'On scheme' }]} />
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
                    {a.free <= 0 && (
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500 flex-1">{a.restock ? `Restock expected ${fmtDate(a.restock.date)}` : 'Restock date to be confirmed'}</span>
                        <button type="button" onClick={() => setOpen(p.id)} className="text-brand-600 font-medium hover:underline whitespace-nowrap">Alternatives</button>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 mt-auto">
                      <QtyStepper value={defQty(p)} onChange={(v) => setQty((s) => ({ ...s, [p.id]: v }))} />
                      {a.free <= 0 && <NotifyButton p={p} alerts={alerts} qty={defQty(p)} />}
                      <Button className="flex-1" icon={ShoppingCart} onClick={() => add(p)}>{a.free <= 0 ? 'Pre-order' : 'Add'}</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card padded={false}>
              <div className="divide-y divide-slate-100">
                {items.map(({ p, quote, a }) => (
                  <div key={p.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3">
                    <ProductImage product={p} size="md" />
                    <div className="flex-1 min-w-0">
                      <button type="button" onClick={() => setOpen(p.id)} className="text-sm font-semibold text-slate-900 hover:text-brand-600 text-left">{p.shortName}</button>
                      <div className="text-[11px] text-slate-500">{p.sku} · {p.category} · MRP {fmtINR(p.mrp)}</div>
                    </div>
                    <AvailabilityBadge a={a} />
                    <div className="text-right w-28"><div className="font-bold tabular-nums">{fmtINR(quote.unitPrice)}</div><div className="text-[11px] text-emerald-600">{quote.totalDiscPct}% off</div></div>
                    <QtyStepper value={defQty(p)} onChange={(v) => setQty((s) => ({ ...s, [p.id]: v }))} />
                    {a.free <= 0 && <NotifyButton p={p} alerts={alerts} qty={defQty(p)} />}
                    <Button size="sm" icon={ShoppingCart} onClick={() => add(p)}>Add</Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Drawer open={!!sel} onClose={() => setOpen(null)} title={sel?.name} subtitle={sel && `${sel.sku} · ${sel.category} · HSN ${sel.hsn}`}
        footer={sel && <>
          <Button variant="secondary" icon={FileDown} onClick={() => { downloadBrochure(sel, company); toast.success('Brochure downloaded', `${sel.sku}-brochure.html`) }}>Brochure</Button>
          <QtyStepper value={defQty(sel)} onChange={(v) => setQty((s) => ({ ...s, [sel.id]: v }))} />
          <Button icon={ShoppingCart} onClick={() => add(sel)}>Add to cart</Button>
        </>}>
        {sel && <ProductDetail p={sel} partnerId={partnerId} pstate={pstate} sst={sst} schemes={liveSchemesFor(sel)} onAdd={add} onAddKit={addKit} onOpen={setOpen} alerts={alerts} qty={defQty(sel)} />}
      </Drawer>

      <Modal open={alertsOpen} onClose={() => setAlertsOpen(false)} title="My stock alerts" subtitle="You get a portal notification and an email as soon as these items are back in stock">
        {alerts.mine.length === 0 ? <EmptyState icon={Bell} title="No stock alerts" message="Use “Notify me” on any unavailable product." /> : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {[...alerts.mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((al) => {
              const p = pstate.products.find((x) => x.id === al.productId)
              const a = p && availability(sst, p)
              return (
                <div key={al.id} className="flex items-center gap-3 px-3 py-2.5">
                  {p && <ProductImage product={p} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <button type="button" className="text-sm font-medium text-slate-800 hover:text-brand-600 text-left truncate block" onClick={() => { setAlertsOpen(false); setOpen(al.productId) }}>{p?.shortName}</button>
                    <div className="text-[11px] text-slate-500">Requested {timeAgo(al.createdAt)} · {al.qty} units{al.status === 'NOTIFIED' ? ` · notified ${fmtDate(al.notifiedAt)}` : a?.restock ? ` · expected ${fmtDate(a.restock.date)}` : ''}</div>
                  </div>
                  {al.status === 'ACTIVE' ? <><Badge tone="amber" dot>Waiting</Badge><Button size="sm" variant="ghost" icon={X} onClick={() => { alerts.cancel(al.id); toast.info('Stock alert removed') }}>Remove</Button></>
                    : <Badge tone={al.status === 'NOTIFIED' ? 'green' : 'gray'} dot>{al.status === 'NOTIFIED' ? 'Back in stock' : 'Removed'}</Badge>}
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}

function AvailabilityPanel({ p, a, alerts, qty }) {
  return (
    <div className={cx('rounded-xl border p-3', a.free > 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-sky-200 bg-sky-50/60')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Availability at Btali warehouse</div>
          <div className="text-sm font-semibold text-slate-900 mt-0.5">{a.free > 0 ? freeLabel(a) : 'Currently not available'}</div>
        </div>
        <AvailabilityBadge a={a} />
      </div>
      {a.free <= 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-600 flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />
            {a.restock ? <>Expected restock <b>{fmtDate(a.restock.date)}</b> · based on {a.restock.basis}</> : 'Restock date will be shared once production is approved.'}
          </div>
          <NotifyButton p={p} alerts={alerts} qty={qty} />
        </div>
      )}
    </div>
  )
}

function ProductDetail({ p, partnerId, pstate, sst, schemes, onAdd, onAddKit, onOpen, alerts, qty }) {
  const quote = quotePrice(pstate, { productId: p.id, partnerId, qty: 1 })
  const partner = pstate.partners.find((x) => x.id === partnerId)
  const pl = pstate.priceLists.find((x) => x.id === partner?.priceListId)
  const a = availability(sst, p)
  const slabs = (pl?.slabs || []).map((s) => ({ ...s, price: quotePrice(pstate, { productId: p.id, partnerId, qty: s.minQty }).unitPrice }))
  const fits = (p.parents || []).map((id) => pstate.products.find((x) => x.id === id)).filter(Boolean)
  const alts = alternativesFor(sst, p)
  return (
    <div className="space-y-5">
      <ProductImage product={p} size="xl" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">Your net price (per unit, excl. GST)</div>
          <div className="text-2xl font-bold text-ink-900 tabular-nums">{fmtINR(quote.unitPrice)}</div>
          <div className="text-xs text-slate-500">MRP {fmtINR(p.mrp)} · {quote.totalDiscPct}% total discount</div>
        </div>
      </div>
      <AvailabilityPanel p={p} a={a} alerts={alerts} qty={qty} />
      {a.free <= 0 && (
        <div>
          <SectionTitle><span className="inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />Suitable alternatives in stock</span></SectionTitle>
          {alts.length === 0 ? <div className="text-sm text-slate-500">No in-stock alternative in this range right now – set a stock alert or contact your Btali sales executive.</div> : (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {alts.map(({ p: x, a: xa }) => (
                <div key={x.id} className="flex items-center gap-3 px-3 py-2">
                  <ProductImage product={x} size="sm" />
                  <button type="button" onClick={() => onOpen(x.id)} className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-slate-800 truncate hover:text-brand-600">{x.shortName}</div>
                    <div className="text-[11px] text-slate-500">{x.sku} · {Object.entries(x.specs || {}).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>
                  </button>
                  <div className="text-right"><div className="text-sm font-semibold tabular-nums">{fmtINR(quotePrice(pstate, { productId: x.id, partnerId, qty: 1 }).unitPrice)}</div><AvailabilityBadge a={xa} /></div>
                  <Button size="sm" variant="soft" icon={Plus} onClick={() => onAdd(x, x.type === 'SPARE' ? 10 : 1)}>Add</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-sm text-slate-600">{p.description}</p>
      {(p.uses || []).length > 0 && (
        <div>
          <SectionTitle>Typical uses</SectionTitle>
          <div className="flex flex-wrap gap-2">{p.uses.map((u) => <span key={u} className="px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-700">{u}</span>)}</div>
        </div>
      )}
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
      {(p.videos || []).length > 0 && (
        <div>
          <SectionTitle>Videos</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-2">
            {p.videos.map((v) => (
              <a key={v.title} href={v.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/30">
                <PlayCircle className="w-8 h-8 text-brand-500 shrink-0" />
                <span className="min-w-0"><span className="block text-sm font-medium text-slate-800 line-clamp-2">{v.title}</span><span className="block text-[11px] text-slate-500">{v.duration} min</span></span>
              </a>
            ))}
          </div>
        </div>
      )}
      {p.type === 'FG' && (p.bom || []).length > 0 && <PartsBreakdown machine={p} pstate={pstate} sst={sst} partnerId={partnerId} onOpen={onOpen} onAdd={onAdd} onAddKit={onAddKit} />}
      {p.type === 'SPARE' && <InterchangeList part={p} pstate={pstate} onOpen={onOpen} />}
      {fits.length > 0 && (
        <div>
          <SectionTitle><span className="inline-flex items-center gap-1"><Info className="w-3.5 h-3.5" />Compatible with</span></SectionTitle>
          <div className="flex flex-wrap gap-2">{fits.map((f) => <button key={f.id} type="button" onClick={() => onOpen(f.id)} className="px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-700 hover:bg-slate-200">{f.sku} · {f.shortName}</button>)}</div>
        </div>
      )}
      <div className="text-xs text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />Every unit carries a unique Btali barcode for warranty registration.</div>
    </div>
  )
}

/** Exploded parts list + service kits for a machine */
function PartsBreakdown({ machine, pstate, sst, partnerId, onOpen, onAdd, onAddKit }) {
  const parts = (machine.partPositions?.length ? machine.partPositions : (machine.bom || []).map((b, i) => ({ productId: b.productId, position: String(i + 1).padStart(2, '0') })))
    .map((x) => ({ ...x, p: pstate.products.find((y) => y.id === x.productId), qty: (machine.bom || []).find((b) => b.productId === x.productId)?.qty || 1 })).filter((x) => x.p)
  return (
    <div className="space-y-4">
      <div>
        <SectionTitle><span className="inline-flex items-center gap-1"><Wrench className="w-3.5 h-3.5" />Spare-parts breakdown</span></SectionTitle>
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="text-left px-3 py-2">Pos.</th><th className="text-left px-3 py-2">Part code</th><th className="text-left px-3 py-2">Description</th><th className="text-right px-3 py-2">Qty / unit</th><th className="text-left px-3 py-2">Availability</th><th className="px-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {parts.map(({ position, p, qty }) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{position}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                  <td className="px-3 py-2"><button type="button" onClick={() => onOpen(p.id)} className="text-left hover:text-brand-600">{p.shortName}</button>{(p.interchange || []).length > 0 && <div className="text-[10px] text-violet-600">Interchangeable: {p.interchange.map((x) => x.code || pstate.products.find((y) => y.id === x.productId)?.sku).join(', ')}</div>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{qty}</td>
                  <td className="px-3 py-2"><AvailabilityBadge a={availability(sst, p)} /></td>
                  <td className="px-2 py-2"><Button size="sm" variant="soft" icon={Plus} onClick={() => onAdd(p, 10)}>10</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {(machine.kits || []).length > 0 && (
        <div>
          <SectionTitle><span className="inline-flex items-center gap-1"><Package className="w-3.5 h-3.5" />Service kits</span></SectionTitle>
          <div className="grid sm:grid-cols-2 gap-2">
            {machine.kits.map((k) => {
              const value = k.items.reduce((s, i) => s + quotePrice(pstate, { productId: i.productId, partnerId, qty: 10 }).unitPrice * i.qty, 0)
              return (
                <div key={k.code} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex justify-between gap-2"><div className="text-sm font-semibold text-slate-800">{k.name}</div><span className="font-mono text-[11px] text-slate-500">{k.code}</span></div>
                  <div className="text-[11px] text-slate-500 mt-1">{k.items.map((i) => pstate.products.find((x) => x.id === i.productId)?.sku).join(' + ')}</div>
                  <div className="flex items-center justify-between mt-2"><span className="text-sm tabular-nums font-medium">{fmtINR(value)} / kit</span><Button size="sm" variant="soft" icon={Plus} onClick={() => onAddKit(k, 1)}>Add kit</Button></div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** Btali-approved interchangeable parts / legacy codes for a spare */
function InterchangeList({ part, pstate, onOpen }) {
  const list = part.interchange || []
  return (
    <div>
      <SectionTitle><span className="inline-flex items-center gap-1"><Repeat className="w-3.5 h-3.5" />Interchangeable parts (Btali approved)</span></SectionTitle>
      {list.length === 0 ? <div className="text-sm text-slate-500">No interchangeable part is approved for this code – use the genuine part only.</div> : (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
          {list.map((x, i) => {
            const eq = x.productId && pstate.products.find((y) => y.id === x.productId)
            return (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Badge tone="violet">{eq ? 'Equivalent part' : 'Alternate code'}</Badge>
                <div className="flex-1 min-w-0">
                  {eq ? <button type="button" onClick={() => onOpen(eq.id)} className="font-mono text-left hover:text-brand-600">{eq.sku} · {eq.shortName}</button> : <span className="font-mono">{x.code}</span>}
                  <div className="text-[11px] text-slate-500">{x.note}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Find spares by machine or by part code (including legacy / interchangeable codes) */
function SparesFinder({ pstate, sst, partnerId, onOpen, onAdd, onAddKit, alerts }) {
  const machines = pstate.products.filter((p) => p.active && p.type === 'FG' && (p.bom || []).length)
  const [machineId, setMachineId] = useState(machines[0]?.id || '')
  const [code, setCode] = useState('')
  const machine = pstate.products.find((p) => p.id === machineId)
  const hits = useMemo(() => {
    const s = code.trim().toLowerCase()
    if (s.length < 2) return []
    return pstate.products.filter((p) => p.type === 'SPARE' && p.active).map((p) => {
      const viaCode = (p.interchange || []).find((x) => (x.code || '').toLowerCase().includes(s))
      const direct = `${p.sku} ${p.name}`.toLowerCase().includes(s)
      return direct || viaCode ? { p, viaCode } : null
    }).filter(Boolean)
  }, [code, pstate.products])
  return (
    <div className="grid lg:grid-cols-3 gap-4 mt-3">
      <Card title="Find by part code" subtitle="Btali codes and approved legacy / interchangeable codes" className="self-start">
        <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SP-MS12 or CAP-25UF-440" className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div className="mt-3 space-y-2">
          {code.trim().length >= 2 && hits.length === 0 && <div className="text-sm text-slate-500">No Btali part matches this code.</div>}
          {hits.map(({ p, viaCode }) => {
            const a = availability(sst, p)
            return (
              <div key={p.id} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-start gap-2">
                  <ProductImage product={p} size="xs" />
                  <button type="button" onClick={() => onOpen(p.id)} className="flex-1 min-w-0 text-left"><div className="text-sm font-medium text-slate-800 hover:text-brand-600">{p.shortName}</div><div className="text-[11px] font-mono text-slate-500">{p.sku}</div></button>
                  <AvailabilityBadge a={a} />
                </div>
                {viaCode && <Alert tone="info" className="mt-2 !p-2 text-xs">{viaCode.code} → use {p.sku}. {viaCode.note}</Alert>}
                <div className="flex gap-2 mt-2">{a.free <= 0 && <NotifyButton p={p} alerts={alerts} qty={10} />}<Button size="sm" variant="soft" icon={Plus} onClick={() => onAdd(p, 10)}>Add 10</Button></div>
              </div>
            )
          })}
        </div>
      </Card>
      <Card title="Parts by machine" subtitle="Exploded parts list, kits and compatibility" className="lg:col-span-2">
        <Combobox options={machines.map((m) => ({ value: m.id, label: `${m.sku} – ${m.shortName}`, sub: m.category }))} value={machineId} onChange={setMachineId} placeholder="Select a machine…" className="mb-4" />
        {machine ? <PartsBreakdown machine={machine} pstate={pstate} sst={sst} partnerId={partnerId} onOpen={onOpen} onAdd={onAdd} onAddKit={onAddKit} /> : <EmptyState icon={Wrench} title="Select a machine" />}
      </Card>
    </div>
  )
}
