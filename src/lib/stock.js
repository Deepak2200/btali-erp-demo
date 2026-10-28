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
