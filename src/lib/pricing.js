// Pricing engine: MRP formula, dealer price lists, bulk slabs, schemes (seasonal / slab / combo / BOGO).
import { round2, today } from './format'

export const mrpFromVendorRate = (vendorRate, currency, settings) => {
  const fx = settings?.fx?.[currency] ?? 1
  return Math.max(10, Math.round((vendorRate * fx * (settings?.mrpMultiplier ?? 3)) / 10) * 10)
}

export const isSchemeLive = (s, date = today()) => s.active && (!s.from || s.from <= date) && (!s.to || s.to >= date)

const schemeApplies = (s, product, partner) => {
  if (s.regions?.length && partner && !s.regions.includes(partner.region)) return false
  if (s.partnerIds?.length && partner && !s.partnerIds.includes(partner.id)) return false
  const catOk = !s.categories?.length || s.categories.includes(product.category)
  const prodOk = !s.productIds?.length || s.productIds.includes(product.id)
  if (s.categories?.length && s.productIds?.length) return catOk || prodOk
  return catOk && prodOk
}

/**
 * Price for one product / partner / qty.
 * Returns { mrp, base, unitPrice, discounts:[{label,pct}], totalDiscPct, schemeIds }
 */
export const quotePrice = (state, { productId, partnerId, qty = 1, date = today() }) => {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return { unitPrice: 0, discounts: [], schemeIds: [] }
  const partner = state.partners.find((p) => p.id === partnerId)
  const pl = state.priceLists.find((p) => p.id === partner?.priceListId) || state.priceLists[0]
  const discounts = []
  let unitPrice
  if (pl?.kind === 'EXPORT') {
    const fx = state.settings.fx[product.currency] ?? 1
    const cost = product.vendorRate * fx
    const m = pl.marginPct ?? state.settings.exportMarginPct ?? 20
    unitPrice = round2(cost * (1 + m / 100))
    discounts.push({ label: `Vendor cost + ${m}% margin`, pct: 0 })
    return { mrp: product.mrp, base: unitPrice, unitPrice, discounts, totalDiscPct: 0, schemeIds: [] }
  }
  if (pl?.overrides?.[productId]) {
    unitPrice = pl.overrides[productId]
    discounts.push({ label: `${pl.name} special rate`, pct: 0 })
  }
  let pct = 0
  if (unitPrice == null) {
    pct += pl?.baseDiscountPct ?? state.settings.baseDiscountPct ?? 50
    discounts.push({ label: `${pl?.name || 'Base'} discount`, pct: pl?.baseDiscountPct ?? 50 })
    if (partner?.extraDiscountPct) {
      pct += partner.extraDiscountPct
      discounts.push({ label: `Dealer tier ${partner.tier || ''} extra`, pct: partner.extraDiscountPct })
    }
  }
  const slab = [...(pl?.slabs || [])].sort((a, b) => b.minQty - a.minQty).find((s) => qty >= s.minQty)
  if (slab) {
    pct += slab.extraPct
    discounts.push({ label: `Bulk slab (${slab.minQty}+ qty)`, pct: slab.extraPct })
  }
  const schemeIds = []
  for (const s of state.schemes || []) {
    if (!isSchemeLive(s, date) || !schemeApplies(s, product, partner)) continue
    if (s.type === 'SEASONAL') {
      pct += s.discountPct
      discounts.push({ label: `Scheme ${s.code}`, pct: s.discountPct })
      schemeIds.push(s.id)
    } else if (s.type === 'SLAB' && qty >= (s.minQty || 0)) {
      pct += s.extraPct
      discounts.push({ label: `Scheme ${s.code} (${s.minQty}+)`, pct: s.extraPct })
      schemeIds.push(s.id)
    }
  }
  if (unitPrice == null) unitPrice = round2(product.mrp * (1 - pct / 100))
  else if (pct) unitPrice = round2(unitPrice * (1 - pct / 100))
  return { mrp: product.mrp, base: round2(product.mrp * (1 - (pl?.baseDiscountPct ?? 50) / 100)), unitPrice, discounts, totalDiscPct: round2(pct), schemeIds }
}

/**
 * Price a full order. lines: [{productId, qty}] -> { lines:[{productId, qty, price, discountPct, amount, schemeIds, free?}], subtotal, gst, total, appliedSchemes }
 * Applies combo + BOGO schemes at order level.
 */
export const priceOrder = (state, partnerId, rawLines, date = today()) => {
  const partner = state.partners.find((p) => p.id === partnerId)
  const lines = rawLines
    .filter((l) => l.productId && Number(l.qty) > 0)
    .map((l) => {
      const q = quotePrice(state, { productId: l.productId, partnerId, qty: Number(l.qty), date })
      const price = l.priceOverride != null && l.priceOverride !== '' ? Number(l.priceOverride) : q.unitPrice
      return { productId: l.productId, qty: Number(l.qty), mrp: q.mrp, price, discountPct: q.totalDiscPct, discounts: q.discounts, schemeIds: q.schemeIds, amount: round2(price * Number(l.qty)) }
    })
  const applied = new Set(lines.flatMap((l) => l.schemeIds))
  for (const s of state.schemes || []) {
    if (!isSchemeLive(s, date)) continue
    if (s.regions?.length && partner && !s.regions.includes(partner.region)) continue
    if (s.type === 'COMBO' && s.comboItems?.length) {
      const sets = Math.min(...s.comboItems.map((ci) => Math.floor((lines.find((l) => l.productId === ci.productId)?.qty || 0) / ci.qty)))
      if (sets > 0) {
        for (const ci of s.comboItems) {
          const l = lines.find((x) => x.productId === ci.productId)
          const comboQty = sets * ci.qty
          const disc = round2(l.price * comboQty * (s.comboDiscountPct / 100))
          l.amount = round2(l.amount - disc)
          l.discounts = [...l.discounts, { label: `Combo ${s.code} on ${comboQty}`, pct: s.comboDiscountPct }]
        }
        applied.add(s.id)
      }
    }
    if (s.type === 'BOGO') {
      const l = lines.find((x) => x.productId === s.buyProductId)
      const free = l ? Math.floor(l.qty / s.buyQty) * s.freeQty : 0
      if (free > 0) {
        lines.push({ productId: s.freeProductId, qty: free, mrp: 0, price: 0, discountPct: 100, discounts: [{ label: `Free – ${s.code}`, pct: 100 }], schemeIds: [s.id], amount: 0, free: true })
        applied.add(s.id)
      }
    }
  }
  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0))
  const gst = round2(subtotal * 0.18)
  return { lines, subtotal, gst, total: round2(subtotal + gst), appliedSchemes: [...applied] }
}

/** Price-list row for the generator: landed cost -> MRP -> dealer net -> margin */
export const priceListRow = (product, pl, settings) => {
  const dealerNet = round2(product.mrp * (1 - (pl?.baseDiscountPct ?? settings.baseDiscountPct) / 100))
  const margin = dealerNet - product.landedCost
  return {
    landedCost: product.landedCost,
    mrp: product.mrp,
    dealerNet,
    margin: round2(margin),
    marginPct: dealerNet ? round2((margin / dealerNet) * 100) : 0,
    belowTarget: dealerNet ? (margin / dealerNet) * 100 < (settings.targetMarginPct ?? 12) : true,
  }
}
