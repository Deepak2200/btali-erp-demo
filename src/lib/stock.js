// Stock math. On-hand is physical stock per location (decremented at invoice).
// Book stock = paid sales orders not yet invoiced/dispatched. Available = on-hand − book stock.
import { sum } from './format'

export const MAIN_WH = 'WH-BTALI'

export const onHand = (state, productId, locationId = MAIN_WH) => state.stock?.[locationId]?.[productId] ?? 0

export const totalOnHand = (state, productId) =>
  Object.entries(state.stock || {}).reduce((a, [, m]) => a + (m[productId] || 0), 0)

export const bookStock = (state, productId, locationId = MAIN_WH) =>
  sum(
    state.salesOrders.filter((s) => s.status === 'PAID' && (s.warehouseId || MAIN_WH) === locationId),
    (s) => sum(s.lines.filter((l) => l.productId === productId), (l) => l.qty),
  )

/** quantities committed in confirmed (unpaid) orders – soft reservation */
export const pendingOrderQty = (state, productId) =>
  sum(
    state.salesOrders.filter((s) => s.status === 'CONFIRMED' || s.status === 'PENDING_REVIEW'),
    (s) => sum(s.lines.filter((l) => l.productId === productId), (l) => l.qty),
  )

/** incoming from POs: shipped (in transit / at port) + in production. Returns [{poId, shipmentId, qty, eta, stage}] */
export const incoming = (state, productId) => {
  const out = []
  for (const po of state.purchaseOrders) {
    if (['RECEIVED', 'CLOSED', 'REJECTED', 'DRAFT', 'CANCELLED'].includes(po.status)) continue
    if (po.type === 'EXPORT') continue // shipped by the vendor straight to the overseas customer, never enters Btali stock
    const qty = sum(po.lines.filter((l) => l.productId === productId), (l) => l.qty)
    if (!qty) continue
    const sh = po.shipmentId ? state.shipments.find((s) => s.id === po.shipmentId) : null
    out.push({ poId: po.id, poNumber: po.number, shipmentId: sh?.id, qty, eta: sh?.eta || po.deliverySchedule?.[0]?.date || null, stage: sh ? sh.status : po.status })
  }
  return out
}
export const incomingQty = (state, productId) => sum(incoming(state, productId), (x) => x.qty)

/**
 * Expected restocking date at the Btali warehouse, from approved updates only:
 *  - shipped containers: latest shipment ETA + customs clearance & port-to-warehouse (5 days)
 *  - approved production (PI approved onwards): vendor ready date + sea transit & clearance (33 days)
 *  - approved domestic POs: PO date + vendor lead time
 * POs still awaiting approval or a PI are ignored. Returns { date, ref, basis } or null.
 */
const PRODUCTION_STAGES = ['IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP']
export const expectedRestock = (state, productId) => {
  const cands = []
  const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  for (const po of state.purchaseOrders) {
    if (po.type === 'EXPORT' || !po.lines.some((l) => l.productId === productId)) continue
    const sh = po.shipmentId ? state.shipments.find((s) => s.id === po.shipmentId) : null
    if (sh && sh.status !== 'RECEIVED' && sh.eta) cands.push({ date: addDays(sh.eta, 5), ref: sh.number, basis: `Container ${sh.containerNo || sh.number} – ETA ${sh.eta}` })
    else if (!sh && PRODUCTION_STAGES.includes(po.status) && po.deliverySchedule?.[0]?.date) cands.push({ date: addDays(po.deliverySchedule[0].date, 33), ref: po.number, basis: `Approved production ${po.number}` })
    else if (po.type === 'DOMESTIC' && po.status === 'APPROVED') {
      const lead = state.products.find((p) => p.id === productId)?.leadTimeDays || 15
      cands.push({ date: addDays(po.date, lead), ref: po.number, basis: `Domestic order ${po.number}` })
    }
  }
  const today = new Date().toISOString().slice(0, 10)
  const next = cands.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
  return next || null
}

export const available = (state, productId, locationId = MAIN_WH) => onHand(state, productId, locationId) - bookStock(state, productId, locationId)

export const stockStatus = (state, product) => {
  const oh = onHand(state, product.id)
  if (oh <= 0) return { key: 'OUT', label: 'Out of stock', tone: 'red' }
  if (oh < product.reorderLevel) return { key: 'LOW', label: 'Below reorder', tone: 'amber' }
  if (oh > product.maxLevel) return { key: 'EXCESS', label: 'Excess', tone: 'violet' }
  return { key: 'OK', label: 'Healthy', tone: 'green' }
}

/** Check whether a set of lines can be fulfilled from a location. Returns shortages [] */
export const checkAvailability = (state, lines, locationId = MAIN_WH) =>
  lines
    .filter((l) => !l.free || true)
    .map((l) => ({ productId: l.productId, need: l.qty, have: onHand(state, l.productId, locationId) }))
    .filter((x) => x.need > x.have)

export const stockValue = (state, locationId = MAIN_WH) =>
  sum(state.products, (p) => onHand(state, p.id, locationId) * p.landedCost)
