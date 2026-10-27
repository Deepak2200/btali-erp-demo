import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Trash2, CheckCircle2, Gift, Tag, Sparkles, Plus, Minus, Package, Truck, ArrowRight } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, Combobox, Field, Select, Textarea, EmptyState, ProductImage, Alert, IconButton, toast, confirm, KV } from '../../components/ui'
import { fmtINR, fmtNum, round2, sum } from '../../lib/format'
import { priceOrder, quotePrice, isSchemeLive } from '../../lib/pricing'
import { usePortal, usePricingState, useStockState, availability, AvailabilityBadge, BankBox } from './_portal'

const isSchemeLabel = (l) => /^Scheme |^Combo /.test(l)

export default function Cart() {
  const nav = useNavigate()
  const { partnerId, partner, base, isFranchise } = usePortal()
  const pstate = usePricingState()
  const sst = useStockState()
  const transporters = useStore((s) => s.transporters)
  const cart = useStore((s) => s.carts?.[partnerId] || [])
  const updateCartLine = useStore((s) => s.updateCartLine)
  const removeCartLine = useStore((s) => s.removeCartLine)
  const clearCart = useStore((s) => s.clearCart)
  const addToCart = useStore((s) => s.addToCart)
  const placePortalOrder = useStore((s) => s.placePortalOrder)
  const [note, setNote] = useState('')
  const [transporterId, setTransporterId] = useState(partner?.transporterId || '')
  const [placed, setPlaced] = useState(null)
  const [busy, setBusy] = useState(false)

  const product = (id) => pstate.products.find((p) => p.id === id)
  const priced = useMemo(() => priceOrder(pstate, partnerId, cart), [pstate, partnerId, cart])

  const benefit = useMemo(() => {
    let scheme = 0
    let mrpTotal = 0
    for (const l of priced.lines) {
      if (l.free) { scheme += quotePrice(pstate, { productId: l.productId, partnerId, qty: 1 }).unitPrice * l.qty; continue }
      mrpTotal += (l.mrp || 0) * l.qty
      const sPct = sum((l.discounts || []).filter((d) => /^Scheme /.test(d.label)), (d) => d.pct)
      if (sPct) scheme += (l.mrp * sPct / 100) * l.qty
      scheme += Math.max(0, round2(l.price * l.qty - l.amount))
    }
    return { scheme: round2(scheme), vsMrp: round2(mrpTotal - priced.subtotal) }
  }, [priced, pstate, partnerId])

  const schemeById = Object.fromEntries((pstate.schemes || []).map((s) => [s.id, s]))
  const nudges = useMemo(() => {
    const out = []
    const qtyOf = (pid) => cart.find((l) => l.productId === pid)?.qty || 0
    for (const s of pstate.schemes || []) {
      if (!isSchemeLive(s) || (s.regions?.length && !s.regions.includes(partner?.region))) continue
      if (s.type === 'BOGO') {
        const q = qtyOf(s.buyProductId)
        if (q > 0 && q % s.buyQty !== 0) out.push({ s, text: `Add ${s.buyQty - (q % s.buyQty)} more ${product(s.buyProductId)?.shortName} to get ${s.freeQty} ${product(s.freeProductId)?.shortName} free`, add: [s.buyProductId, s.buyQty - (q % s.buyQty)] })
      }
      if (s.type === 'COMBO' && s.comboItems?.length) {
        const have = s.comboItems.filter((ci) => qtyOf(ci.productId) >= ci.qty)
        const miss = s.comboItems.find((ci) => qtyOf(ci.productId) < ci.qty)
        if (have.length && miss) {
          const target = Math.max(...have.map((ci) => Math.floor(qtyOf(ci.productId) / ci.qty))) * miss.qty
          out.push({ s, text: `Add ${target - qtyOf(miss.productId)} × ${product(miss.productId)?.shortName} to unlock ${s.comboDiscountPct}% combo discount`, add: [miss.productId, target - qtyOf(miss.productId)] })
        }
      }
      if (s.type === 'SLAB') {
        const best = cart.filter((l) => (s.categories || []).includes(product(l.productId)?.category) && l.qty < s.minQty).sort((a, b) => b.qty - a.qty)[0]
        if (best && best.qty >= s.minQty / 3) out.push({ s, text: `Add ${s.minQty - best.qty} more ${product(best.productId)?.shortName} (${s.minQty}+ units) for an extra ${s.extraPct}% – ${s.code}`, add: [best.productId, s.minQty - best.qty] })
      }
    }
    return out
  }, [cart, pstate, partner]) // eslint-disable-line

  const place = async () => {
    const ok = await confirm({ title: 'Place this order?', message: `${priced.lines.length} line(s) · ${fmtINR(priced.total)} incl. GST.\nBtali Sales will review and confirm the order, then share payment instructions.`, confirmText: 'Place order' })
    if (!ok) return
    setBusy(true)
    const r = placePortalOrder(partnerId, { note, transporterId })
    setBusy(false)
    if (!r.ok) return toast.error('Could not place order', r.error)
    setPlaced(r.so)
    setNote('')
    toast.success('Order placed', `${r.so.number} sent to Btali Sales for review`)
  }

  if (placed) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3"><CheckCircle2 className="w-8 h-8" /></div>
            <h1 className="text-xl font-bold text-ink-900">Order placed successfully</h1>
            <p className="text-sm text-slate-500 mt-1">Your order number is</p>
            <div className="text-2xl font-mono font-bold text-brand-600 mt-1">{placed.number}</div>
            <div className="text-sm text-slate-600 mt-2">{fmtNum(placed.lines.length)} line(s) · {fmtINR(placed.total)} incl. GST</div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            {[['1', 'Sales review', 'Btali Sales checks stock & schemes – usually within 2 working hours.'], ['2', 'Pay advance', 'You get a confirmation email with the amount and bank details.'], ['3', 'Invoice & dispatch', 'Once Accounts confirms payment, the invoice and LR are shared here.']].map(([n, t, d]) => (
              <div key={n} className="rounded-lg bg-slate-50 p-3"><div className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center mb-2">{n}</div><div className="font-semibold text-slate-800">{t}</div><div className="text-xs text-slate-500 mt-0.5">{d}</div></div>
            ))}
          </div>
          <BankBox className="mt-4" reference={placed.number} />
          <div className="flex flex-wrap gap-2 justify-center mt-5">
            <Button icon={Package} onClick={() => nav(`${base}/orders?so=${placed.id}`)}>Track this order</Button>
            <Button variant="secondary" onClick={() => { setPlaced(null); nav(`${base}/catalog`) }}>Continue shopping</Button>
          </div>
        </Card>
      </div>
    )
  }

  const options = pstate.products.filter((p) => p.active && (!partner?.authorizedCategories?.length || partner.authorizedCategories.includes(p.category))).map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: `${p.category} · MRP ${fmtINR(p.mrp)}` }))

  return (
    <div>
      <PageHeader title="Cart & checkout" subtitle={cart.length ? `${cart.length} item(s) · prices include your ${isFranchise ? 'store transfer' : 'dealer'} discount and live schemes` : 'Your cart is empty'}
        actions={cart.length > 0 && <>
          <Button variant="secondary" icon={ShoppingCart} onClick={() => nav(`${base}/catalog`)}>Add more</Button>
          <Button variant="ghost" icon={Trash2} onClick={async () => { if (await confirm({ title: 'Empty cart?', message: 'All items will be removed.', tone: 'danger', confirmText: 'Empty cart' })) { clearCart(partnerId); toast.success('Cart emptied') } }}>Empty</Button>
        </>} />

      {cart.length === 0 ? (
        <Card><EmptyState icon={ShoppingCart} title="Your cart is empty" message="Browse the catalog or reorder a previous order to get started." action={<div className="flex gap-2 justify-center"><Button onClick={() => nav(`${base}/catalog`)}>Browse catalog</Button><Button variant="secondary" onClick={() => nav(`${base}/orders`)}>Reorder from history</Button></div>} /></Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2 space-y-4">
            <Card padded={false}>
              <div className="divide-y divide-slate-100">
                {priced.lines.map((l, i) => {
                  const p = product(l.productId)
                  const a = availability(sst, p)
                  const cartLine = cart.find((c) => c.productId === l.productId)
                  return (
                    <div key={`${l.productId}-${i}`} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <ProductImage product={p} size="md" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">{p?.shortName}</div>
                          <div className="text-[11px] text-slate-500">{p?.sku} · MRP {fmtINR(p?.mrp)}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {l.free ? <Badge tone="violet"><Gift className="w-3 h-3" />Free – {schemeById[l.schemeIds[0]]?.code}</Badge> : <AvailabilityBadge a={a} />}
                            {!l.free && (l.discounts || []).filter((d) => isSchemeLabel(d.label)).map((d) => <Badge key={d.label} tone="brand"><Tag className="w-3 h-3" />{d.label.replace(/^Scheme /, '')}</Badge>)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        {l.free ? <span className="text-sm text-slate-500 tabular-nums">× {l.qty}</span> : (
                          <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden">
                            <button type="button" aria-label="Decrease" className="px-2 py-1.5 hover:bg-slate-50" onClick={() => updateCartLine(partnerId, l.productId, Math.max(1, (cartLine?.qty || 1) - 1))}><Minus className="w-3.5 h-3.5" /></button>
                            <input value={cartLine?.qty ?? l.qty} inputMode="numeric" onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, '')); if (v > 0) updateCartLine(partnerId, l.productId, v) }} className="w-12 text-center text-sm tabular-nums focus:outline-none" />
                            <button type="button" aria-label="Increase" className="px-2 py-1.5 hover:bg-slate-50" onClick={() => updateCartLine(partnerId, l.productId, (cartLine?.qty || 0) + 1)}><Plus className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                        <div className="text-right w-28">
                          <div className="text-sm font-bold tabular-nums">{l.free ? 'FREE' : fmtINR(l.amount)}</div>
                          {!l.free && <div className="text-[11px] text-slate-500 tabular-nums">{fmtINR(l.price)} × {l.qty} · {l.discountPct}% off</div>}
                        </div>
                        {!l.free ? <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => removeCartLine(partnerId, l.productId)} /> : <span className="w-7" />}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-xl">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <span className="text-xs font-medium text-slate-500 shrink-0">Quick add</span>
                  <Combobox className="flex-1" options={options} value="" onChange={(v) => { const p = product(v); addToCart(partnerId, v, p?.type === 'SPARE' ? 10 : 1); toast.success('Added', p?.shortName) }} placeholder="Search a product to add…" />
                </div>
              </div>
            </Card>

            {nudges.length > 0 && (
              <Card title="Unlock more savings" subtitle="Schemes you are close to qualifying for">
                <div className="space-y-2">
                  {nudges.map((n, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-brand-50/70 border border-brand-100 px-3 py-2">
                      <Sparkles className="w-4 h-4 text-brand-600 shrink-0" />
                      <div className="flex-1 text-sm text-brand-900">{n.text}</div>
                      {n.add && <Button size="sm" variant="soft" onClick={() => { addToCart(partnerId, n.add[0], n.add[1]); toast.success('Cart updated', n.s.name) }}>Add</Button>}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {priced.lines.some((l) => !l.free && availability(sst, product(l.productId)).free < l.qty) && (
              <Alert tone="info" title="Some items exceed free stock">Lines marked Limited / Arriving will be confirmed by Sales; they are dispatched as soon as the incoming container is received.</Alert>
            )}
          </div>

          <div className="space-y-4 lg:sticky lg:top-4">
            <Card title="Order summary">
              <KV label="Items" value={`${priced.lines.filter((l) => !l.free).length} lines · ${fmtNum(sum(priced.lines, (l) => l.qty))} units`} />
              <KV label="Value at MRP" value={<span className="line-through text-slate-400">{fmtINR(sum(priced.lines.filter((l) => !l.free), (l) => l.mrp * l.qty))}</span>} />
              <KV label="Taxable value" value={fmtINR(priced.subtotal)} />
              <KV label="GST @18%" value={fmtINR(priced.gst)} />
              <div className="flex justify-between items-center border-t border-slate-200 mt-2 pt-3"><span className="font-semibold">Order total</span><span className="text-xl font-bold text-ink-900 tabular-nums">{fmtINR(priced.total)}</span></div>
              <div className="mt-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2 space-y-0.5">
                <div className="flex justify-between"><span>You save vs MRP</span><b className="tabular-nums">{fmtINR(benefit.vsMrp)}</b></div>
                {benefit.scheme > 0 && <div className="flex justify-between"><span>incl. scheme benefits</span><b className="tabular-nums">{fmtINR(benefit.scheme)}</b></div>}
              </div>
              {priced.appliedSchemes.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{priced.appliedSchemes.map((id) => <Badge key={id} tone="brand">{schemeById[id]?.code}</Badge>)}</div>}
            </Card>
            <Card title="Delivery & notes">
              <div className="space-y-3">
                <Field label="Preferred transporter"><Select value={transporterId} onChange={(e) => setTransporterId(e.target.value)} options={transporters.map((t) => ({ value: t.id, label: `${t.name}${t.id === partner?.transporterId ? ' (default)' : ''}` }))} /></Field>
                <Field label="Note for Btali Sales"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. urgent for Diwali, part dispatch OK" /></Field>
                <div className="text-[11px] text-slate-500 flex gap-1.5"><Truck className="w-3.5 h-3.5 shrink-0" />Payment terms: 100% advance. Goods are invoiced and dispatched after Accounts confirms your payment.</div>
              </div>
              <Button size="lg" className="w-full mt-4" iconRight={ArrowRight} loading={busy} onClick={place}>Place order · {fmtINR(priced.total)}</Button>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
