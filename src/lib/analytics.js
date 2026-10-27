// Analytics + AI-assisted planning (demand forecast with seasonality, reorder recommendation, F/M/S).
import { addDays, daysAgo, lastMonths, monthKey, monthLabel, round2, sum, today } from './format'
import { bookStock, incoming, onHand } from './stock'

/** Flattened sales lines from invoices (excludes FOC / free lines). */
export const salesLines = (state, { from, to, partnerType } = {}) => {
  const prod = Object.fromEntries(state.products.map((p) => [p.id, p]))
  const part = Object.fromEntries(state.partners.map((p) => [p.id, p]))
  const out = []
  for (const inv of state.invoices) {
    if (inv.type && inv.type !== 'TAX' && inv.type !== 'EXPORT') continue
    if (from && inv.date < from) continue
    if (to && inv.date > to) continue
    const pt = part[inv.partnerId]
    if (partnerType && pt?.type !== partnerType) continue
    for (const l of inv.lines) {
      const p = prod[l.productId]
      if (!p || l.free) continue
      out.push({
        date: inv.date,
        month: monthKey(inv.date),
        invoiceId: inv.id,
        partnerId: inv.partnerId,
        partnerName: pt?.name,
        partnerType: pt?.type,
        region: pt?.region || '—',
        salespersonId: pt?.salespersonId,
        productId: p.id,
        sku: p.sku,
        productName: p.shortName || p.name,
        category: p.category,
        qty: l.qty,
        revenue: l.amount,
        cost: round2(l.qty * p.landedCost),
      })
    }
  }
  // POS sales at franchise stores count as franchise sell-out (not Btali revenue) – excluded here on purpose.
  return out
}

export const aggregate = (lines, keyFn) => {
  const m = new Map()
  for (const l of lines) {
    const k = keyFn(l)
    const r = m.get(k) || { key: k, qty: 0, revenue: 0, cost: 0, orders: new Set() }
    r.qty += l.qty
    r.revenue += l.revenue
    r.cost += l.cost
    r.orders.add(l.invoiceId)
    m.set(k, r)
  }
  return [...m.values()].map((r) => ({ ...r, revenue: round2(r.revenue), cost: round2(r.cost), margin: round2(r.revenue - r.cost), marginPct: r.revenue ? round2(((r.revenue - r.cost) / r.revenue) * 100) : 0, orders: r.orders.size }))
}

export const monthlySeries = (state, n = 12, filter = () => true) => {
  const months = lastMonths(n)
  const lines = salesLines(state, { from: `${months[0]}-01` }).filter(filter)
  const agg = Object.fromEntries(aggregate(lines, (l) => l.month).map((r) => [r.key, r]))
  return months.map((m) => ({ month: m, label: monthLabel(m), revenue: agg[m]?.revenue || 0, qty: agg[m]?.qty || 0, margin: agg[m]?.margin || 0, orders: agg[m]?.orders || 0 }))
}

/** F/M/S classification by units sold in the window, ranked within FG and spares separately. */
export const fmsMap = (state, days = 90) => {
  const lines = salesLines(state, { from: daysAgo(days) })
  const qty = Object.fromEntries(aggregate(lines, (l) => l.productId).map((r) => [r.key, r.qty]))
  const out = {}
  for (const type of ['FG', 'SPARE']) {
    const list = state.products.filter((p) => p.type === type).map((p) => ({ id: p.id, q: qty[p.id] || 0 })).sort((a, b) => b.q - a.q)
    list.forEach((x, i) => {
      const r = i / list.length
      out[x.id] = { cls: r < 0.3 ? 'F' : r < 0.7 ? 'M' : 'S', qty: x.q, perMonth: round2(x.q / (days / 30)) }
    })
  }
  return out
}

/** Product profitability & contribution for a period */
export const profitability = (state, { from, to } = {}) => {
  const lines = salesLines(state, { from, to })
  const rows = aggregate(lines, (l) => l.productId)
  const totRev = sum(rows, (r) => r.revenue)
  const totMargin = sum(rows, (r) => r.margin)
  const prod = Object.fromEntries(state.products.map((p) => [p.id, p]))
  return state.products.map((p) => {
    const r = rows.find((x) => x.key === p.id) || { qty: 0, revenue: 0, cost: 0, margin: 0, marginPct: 0, orders: 0 }
    return {
      productId: p.id,
      sku: p.sku,
      name: prod[p.id].shortName,
      category: p.category,
      landedCost: p.landedCost,
      avgSellPrice: r.qty ? round2(r.revenue / r.qty) : 0,
      mrp: p.mrp,
      unitMargin: r.qty ? round2((r.revenue - r.cost) / r.qty) : 0,
      ...r,
      revenueShare: totRev ? round2((r.revenue / totRev) * 100) : 0,
      profitShare: totMargin ? round2((r.margin / totMargin) * 100) : 0,
    }
  })
}

/** Monthly unit demand for a product (12 months) */
export const productDemand = (state, productId, n = 12) => {
  const months = lastMonths(n)
  const lines = salesLines(state, { from: `${months[0]}-01` }).filter((l) => l.productId === productId)
  const m = Object.fromEntries(aggregate(lines, (l) => l.month).map((r) => [r.key, r.qty]))
  return months.map((k) => ({ month: k, label: monthLabel(k), qty: m[k] || 0 }))
}

/**
 * Seasonal forecast. Level = mean of last 3 complete months de-seasonalised; seasonal index from 12-month history
 * blended with category seasonality. Returns next `h` months [{month,label,qty}]
 */
export const forecastDemand = (state, productId, h = 3) => {
  const hist = productDemand(state, productId, 13).slice(0, -1) // last 12 complete months
  const avg = sum(hist, (x) => x.qty) / (hist.length || 1) || 0.0001
  const idx = (monthIdx) => {
    const same = hist.filter((x) => +x.month.slice(5) === monthIdx)
    const raw = same.length ? sum(same, (x) => x.qty) / same.length / avg : 1
    return 0.5 + 0.5 * (isFinite(raw) && raw > 0 ? raw : 1)
  }
  const last3 = hist.slice(-3)
  const level = sum(last3, (x) => x.qty / idx(+x.month.slice(5))) / (last3.length || 1)
  const out = []
  const d = new Date()
  for (let i = 1; i <= h; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() + i, 1)
    const mi = x.getMonth() + 1
    const k = `${x.getFullYear()}-${String(mi).padStart(2, '0')}`
    out.push({ month: k, label: monthLabel(k), qty: Math.max(0, Math.round(level * idx(mi))) })
  }
  return out
}

/** AI-assisted reorder recommendation for one product */
export const reorderRecommendation = (state, product, { coverDays = 45, safetyDays = 15 } = {}) => {
  const fc = forecastDemand(state, product.id, 3)
  const monthly = fc[0]?.qty || 0
  const daily = monthly / 30
  const oh = onHand(state, product.id)
  const book = bookStock(state, product.id)
  const inc = incoming(state, product.id)
  const incQty = sum(inc, (x) => x.qty)
  const lead = product.leadTimeDays
  const safety = daily * safetyDays
  const needUntil = daily * (lead + coverDays) + safety
  const net = oh - book + incQty
  let qty = Math.max(0, Math.ceil(needUntil - net))
  if (oh < product.reorderLevel && qty < product.moq) qty = product.moq
  if (qty > 0) qty = Math.ceil(qty / product.moq) * product.moq
  const daysOfCover = daily > 0 ? Math.floor((oh - book) / daily) : 999
  const orderInDays = daily > 0 ? Math.floor((oh - book + incQty - safety - daily * lead) / daily) : 999
  const orderBy = orderInDays >= 999 ? null : addDays(today(), Math.max(0, orderInDays))
  const hist = productDemand(state, product.id, 6).map((x) => x.qty)
  const mean = sum(hist) / (hist.length || 1)
  const sd = Math.sqrt(sum(hist, (x) => (x - mean) ** 2) / (hist.length || 1))
  const cv = mean ? sd / mean : 1
  const confidence = cv < 0.3 ? 'High' : cv < 0.6 ? 'Medium' : 'Low'
  const urgency = oh <= 0 ? 'CRITICAL' : oh < product.reorderLevel || orderInDays <= 0 ? 'HIGH' : orderInDays <= 15 ? 'MEDIUM' : 'LOW'
  const reasons = []
  if (oh < product.reorderLevel) reasons.push(`On-hand ${oh} is below reorder level ${product.reorderLevel}`)
  if (book) reasons.push(`${book} units already booked (paid, not dispatched)`)
  if (incQty) reasons.push(`${incQty} units incoming (${inc.map((x) => x.poNumber).join(', ')})`)
  reasons.push(`Forecast ${monthly}/month (seasonal) · lead time ${lead} days`)
  return { productId: product.id, forecast: fc, monthly, daily: round2(daily), onHand: oh, book, incoming: incQty, incomingList: inc, qty, orderBy, orderInDays, daysOfCover, confidence, urgency, reasons }
}

/** Dealer reorder nudge: average gap between orders & time since last */
export const dealerNudges = (state) => {
  const out = []
  for (const p of state.partners.filter((x) => x.type === 'DEALER' && x.stage === 'CURRENT')) {
    const orders = state.salesOrders.filter((s) => s.partnerId === p.id && s.status !== 'CANCELLED').map((s) => s.date).sort()
    if (orders.length < 3) continue
    const gaps = orders.slice(1).map((d, i) => (new Date(d) - new Date(orders[i])) / 86400000)
    const avgGap = Math.round(sum(gaps) / gaps.length)
    const since = Math.round((Date.now() - new Date(orders[orders.length - 1])) / 86400000)
    const lowStock = Object.entries(p.stock || {}).filter(([pid, q]) => q < (p.stockMin?.[pid] ?? 3)).map(([pid]) => pid)
    const score = since / Math.max(avgGap, 1)
    if (score >= 0.9 || lowStock.length) {
      out.push({ partnerId: p.id, avgGap, since, lastOrder: orders[orders.length - 1], orders: orders.length, lowStock, score: round2(score), reason: lowStock.length ? `${lowStock.length} items below dealer min stock` : `Usually orders every ${avgGap} days – ${since} days since last order` })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

export const dateRangePresets = () => ({
  '30D': { from: daysAgo(30), to: today(), label: 'Last 30 days' },
  '90D': { from: daysAgo(90), to: today(), label: 'Last 90 days' },
  FY: { from: '2026-04-01', to: today(), label: 'FY 2026-27 YTD' },
  '12M': { from: daysAgo(365), to: today(), label: 'Last 12 months' },
})
