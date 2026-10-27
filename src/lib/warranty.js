// Barcode-driven warranty validation across the three warranty relationships.
import { addDays, daysBetween, today } from './format'

export const resolveTerms = (state, product, { vendorId, partnerId } = {}) => {
  const rules = state.warrantyRules || []
  const pick = (scope, ref) => rules.find((r) => r.scope === scope && r.ref === ref)
  const prodRule = pick('PRODUCT', product.id)
  const partnerRule = partnerId ? pick('PARTNER', partnerId) : null
  const vendorRule = vendorId ? pick('VENDOR', vendorId) : null
  const catRule = pick('CATEGORY', product.category)
  const base = prodRule || partnerRule || catRule || {}
  return {
    months: base.months ?? product.warrantyMonths ?? 12,
    partnerMonths: (partnerRule?.partnerMonths ?? base.partnerMonths) ?? (product.warrantyMonths + 3),
    vendorMonths: (vendorRule?.vendorMonths ?? base.vendorMonths) ?? (product.warrantyMonths + 6),
    exclusions: base.exclusions || '',
    extended: base.extended || '',
    ruleIds: [prodRule, partnerRule, vendorRule, catRule].filter(Boolean).map((r) => r.id),
  }
}

const status = (end) => {
  if (!end) return { valid: false, daysLeft: null }
  const d = daysBetween(today(), end)
  return { valid: d >= 0, daysLeft: d }
}

/** Look up a barcode (or warranty number / phone) and return full validity across relationships. */
export const checkWarranty = (state, query) => {
  const q = String(query || '').trim().toUpperCase()
  if (!q) return { found: false }
  const unit = state.units.find((u) => u.code.toUpperCase() === q)
  const warranty = state.warranties.find((w) => w.barcode.toUpperCase() === q || w.number.toUpperCase() === q)
  if (!unit && !warranty) return { found: false, query: q }
  const code = unit?.code || warranty.barcode
  const product = state.products.find((p) => p.id === (unit?.productId || warranty?.productId))
  const terms = resolveTerms(state, product, { vendorId: unit?.vendorId || product?.vendorId, partnerId: warranty?.partnerId || unit?.partnerId })
  const partner = state.partners.find((p) => p.id === (warranty?.partnerId || unit?.partnerId))
  const vendor = state.vendors.find((v) => v.id === (unit?.vendorId || product?.vendorId))
  const shipment = unit?.poId ? state.shipments.find((s) => s.poIds.includes(unit.poId)) : null
  const inwardDate = shipment?.inward?.date || null
  const dispatchEvent = unit?.history?.find((h) => h.event.startsWith('Dispatched'))
  const dispatchDate = dispatchEvent ? dispatchEvent.ts.slice(0, 10) : null
  const customerEnd = warranty?.endDate || null
  const partnerEnd = dispatchDate ? addDays(dispatchDate, Math.round(terms.partnerMonths * 30.4)) : null
  const vendorEnd = inwardDate ? addDays(inwardDate, Math.round(terms.vendorMonths * 30.4)) : null
  const claims = state.warrantyClaims.filter((c) => c.barcode === code)
  return {
    found: true,
    code,
    unit,
    product,
    warranty,
    partner,
    vendor,
    terms,
    claims,
    customer: { ...status(customerEnd), start: warranty?.startDate, end: customerEnd, registered: !!warranty },
    partnerCover: { ...status(partnerEnd), start: dispatchDate, end: partnerEnd },
    vendorCover: { ...status(vendorEnd), start: inwardDate, end: vendorEnd },
  }
}
