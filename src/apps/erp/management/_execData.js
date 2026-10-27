// Shared calculations for the Executive and Performance dashboards.
import { addDays, daysBetween, lastMonths, monthLabel, round2, sum, today } from '../../../lib/format'
import { aggregate, salesLines, fmsMap } from '../../../lib/analytics'
import { incoming, onHand, totalOnHand, MAIN_WH } from '../../../lib/stock'
import { receivablesAgeing } from '../common/_alerts'

export const PRESETS = [
  { key: '30D', label: '30 days', days: 30 },
  { key: '90D', label: '90 days', days: 90 },
  { key: 'FY', label: 'FY YTD' },
  { key: '12M', label: '12 months', days: 365 },
]

export const periodFor = (key) => {
  const t = today()
  let from
  if (key === 'FY') {
    const d = new Date()
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
    from = `${y}-04-01`
  } else from = addDays(t, -(PRESETS.find((p) => p.key === key)?.days || 90))
  const len = daysBetween(from, t)
  return { from, to: t, prevFrom: addDays(from, -len - 1), prevTo: addDays(from, -1), days: Math.max(1, len), label: PRESETS.find((p) => p.key === key)?.label }
}

export const pctChange = (cur, prev) => (prev ? round2(((cur - prev) / prev) * 100) : null)

const OPEN_SO = ['PENDING_REVIEW', 'CONFIRMED', 'PAID']
const FX = (state, cur) => state.settings?.fx?.[cur] || 1

/** Payables: vendor bills not yet paid; falls back to PO balances committed to import suppliers */
export const payablesView = (state) => {
  const bills = (state.vendorBills || []).filter((b) => !['PAID', 'REJECTED'].includes(b.status))
  const billTotal = sum(bills, (b) => b.amountINR ?? (b.amount || 0) * (b.fxRate || FX(state, b.currency)))
  const poCommit = state.purchaseOrders
    .filter((p) => ['APPROVED', 'PI_RECEIVED', 'IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP', 'SHIPPED'].includes(p.status))
    .map((p) => {
      const v = state.vendors.find((x) => x.id === p.vendorId)
      const value = sum(p.lines, (l) => l.qty * l.rate) * FX(state, p.currency)
      const advPaid = ['IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP', 'SHIPPED'].includes(p.status)
      const due = advPaid ? value * ((v?.paymentTerms?.balancePct ?? 70) / 100) : value
      return { po: p, vendor: v, value, due }
    })
  return { bills, billTotal, poCommit, poCommitTotal: sum(poCommit, (x) => x.due), source: bills.length ? 'BILLS' : 'PO' }
}

export const bankTotal = (state) => sum(state.bankAccounts || [], (b) => b.balance ?? b.currentBalance ?? b.closingBalance ?? 0)

export const stockValueAll = (state) => sum(state.products, (p) => totalOnHand(state, p.id) * (p.landedCost || 0))

/** All executive KPIs for a period */
export const execKpis = (state, period) => {
  const lines = salesLines(state, { from: period.from, to: period.to })
  const prevLines = salesLines(state, { from: period.prevFrom, to: period.prevTo })
  const revenue = sum(lines, (l) => l.revenue)
  const cost = sum(lines, (l) => l.cost)
  const prevRevenue = sum(prevLines, (l) => l.revenue)
  const prevCost = sum(prevLines, (l) => l.cost)
  const marginPct = revenue ? ((revenue - cost) / revenue) * 100 : 0
  const prevMarginPct = prevRevenue ? ((prevRevenue - prevCost) / prevRevenue) * 100 : 0

  const stockValue = stockValueAll(state)
  const recv = receivablesAgeing(state)
  const pay = payablesView(state)
  const payables = pay.source === 'BILLS' ? pay.billTotal : pay.poCommitTotal
  const workingCapital = stockValue + recv.total - payables

  const cogs90 = sum(salesLines(state, { from: addDays(today(), -90) }), (l) => l.cost)
  const dailyCogs = cogs90 / 90
  const coverDays = dailyCogs ? Math.round(stockValue / dailyCogs) : 0

  // SO -> dispatch lead time
  const invById = Object.fromEntries(state.invoices.map((i) => [i.id, i]))
  const leads = []
  const confirmToInvoice = []
  const invoiceToLr = []
  for (const so of state.salesOrders) {
    if (so.date < period.from || so.date > period.to || !so.invoiceId) continue
    const inv = invById[so.invoiceId]
    if (!inv) continue
    confirmToInvoice.push(daysBetween(so.date, inv.date))
    if (inv.lr?.date) {
      leads.push(daysBetween(so.date, inv.lr.date))
      invoiceToLr.push(daysBetween(inv.date, inv.lr.date))
    }
  }
  const avg = (a) => (a.length ? round2(sum(a) / a.length) : 0)
  const onTime3 = leads.length ? round2((leads.filter((d) => d <= 3).length / leads.length) * 100) : 0

  return {
    lines, prevLines, revenue: round2(revenue), prevRevenue: round2(prevRevenue), revTrend: pctChange(revenue, prevRevenue),
    margin: round2(revenue - cost), marginPct: round2(marginPct), marginTrend: prevMarginPct ? round2(marginPct - prevMarginPct) : null,
    stockValue, receivables: recv.total, ageing: recv.buckets, payables, payablesSource: pay.source, pay, workingCapital,
    bank: bankTotal(state), coverDays, dailyCogs,
    leadAvg: avg(leads), confirmToInvoice: avg(confirmToInvoice), invoiceToLr: avg(invoiceToLr), onTime3, dispatchedCount: leads.length,
  }
}

/** Open orders whose demand exceeds on-hand stock, with the next inbound shipment and its delay */
export const orderShortfalls = (state) => {
  const t = today()
  const need = {}
  const soByProduct = {}
  for (const so of state.salesOrders) {
    if (!OPEN_SO.includes(so.status)) continue
    for (const l of so.lines) {
      need[l.productId] = (need[l.productId] || 0) + l.qty
      ;(soByProduct[l.productId] = soByProduct[l.productId] || []).push(so)
    }
  }
  const out = []
  for (const [pid, q] of Object.entries(need)) {
    const oh = onHand(state, pid, MAIN_WH)
    if (q <= oh) continue
    const p = state.products.find((x) => x.id === pid)
    const inc = incoming(state, pid).sort((a, b) => String(a.eta || '9999').localeCompare(String(b.eta || '9999')))
    const next = inc[0]
    const sh = next?.shipmentId ? state.shipments.find((s) => s.id === next.shipmentId) : null
    const delay = next?.eta && next.eta < t && (!sh || sh.status !== 'RECEIVED') ? daysBetween(next.eta, t) : 0
    out.push({
      id: pid, productId: pid, product: p, demand: q, onHand: oh, shortfall: q - oh, orders: soByProduct[pid],
      value: sum(soByProduct[pid], (so) => sum(so.lines.filter((l) => l.productId === pid), (l) => l.amount || 0)),
      next, shipment: sh, delay, status: !next ? 'NO_INBOUND' : delay > 0 ? 'DELAYED' : 'INBOUND',
    })
  }
  return out.sort((a, b) => (b.status === 'DELAYED') - (a.status === 'DELAYED') || b.value - a.value)
}

/** Shipments not yet received, with delay and value of open orders waiting on them */
export const shipmentImpact = (state) => {
  const t = today()
  const shortfalls = orderShortfalls(state)
  return state.shipments
    .filter((s) => s.status !== 'RECEIVED')
    .map((sh) => {
      const pos = state.purchaseOrders.filter((p) => sh.poIds.includes(p.id))
      const pids = new Set(pos.flatMap((p) => p.lines.map((l) => l.productId)))
      const blocked = shortfalls.filter((x) => pids.has(x.productId))
      const delay = sh.eta && sh.eta < t ? daysBetween(sh.eta, t) : 0
      const done = (sh.milestones || []).filter((m) => m.done).length
      return {
        ...sh, pos, delay, progress: sh.milestones?.length ? Math.round((done / sh.milestones.length) * 100) : 0,
        nextMilestone: (sh.milestones || []).find((m) => !m.done),
        value: sum(pos, (p) => sum(p.lines, (l) => l.qty * l.rate) * FX(state, p.currency)),
        blockedOrders: [...new Set(blocked.flatMap((b) => b.orders.map((o) => o.id)))].length,
        blockedValue: sum(blocked, (b) => b.value),
      }
    })
    .sort((a, b) => String(a.eta).localeCompare(String(b.eta)))
}

/** Supplier vs dealer cash cycle (days) */
export const cashCycle = (state, k, period) => {
  // supplier: advance at PO approval -> goods received (cash locked before stock arrives)
  const recvd = state.purchaseOrders.filter((p) => p.type === 'IMPORT' && ['RECEIVED', 'CLOSED'].includes(p.status))
  const supplierLead = recvd.length
    ? round2(sum(recvd, (p) => {
        const sh = state.shipments.find((s) => s.id === p.shipmentId)
        const end = sh?.inward?.date || sh?.ata || p.receivedAt
        return end ? daysBetween(p.date, end) : 0
      }) / recvd.length)
    : 0
  const creditDays = (() => {
    const vs = state.vendors.filter((v) => v.type === 'CHINA' || v.type === 'INDIA')
    return vs.length ? round2(sum(vs, (v) => v.paymentTerms?.creditDays || 0) / vs.length) : 0
  })()
  // dealer: SO date -> receipt date
  const rec = (state.receipts || []).filter((r) => r.soId)
  const soById = Object.fromEntries(state.salesOrders.map((s) => [s.id, s]))
  const lags = rec.map((r) => (soById[r.soId] ? Math.max(0, daysBetween(soById[r.soId].date, r.date)) : null)).filter((x) => x != null)
  const dealerLag = lags.length ? round2(sum(lags) / lags.length) : 0
  const dso = k.revenue ? round2(k.receivables / ((k.revenue * 1.18) / period.days)) : 0
  const dio = k.coverDays
  return { supplierLead: Math.round(supplierLead), creditDays: Math.round(creditDays), dealerLag: Math.round(dealerLag), dso: Math.round(dso), dio, ccc: Math.round(dio + dso - creditDays) }
}

/** Dealer performance rows for a period */
export const dealerPerformance = (state, period) => {
  const cur = aggregate(salesLines(state, { from: period.from, to: period.to }), (l) => l.partnerId)
  const prev = aggregate(salesLines(state, { from: period.prevFrom, to: period.prevTo }), (l) => l.partnerId)
  const total = sum(cur, (r) => r.revenue)
  const curM = today().slice(0, 7)
  const monthRev = aggregate(salesLines(state, { from: `${curM}-01` }), (l) => l.partnerId)
  const targets = state.targets || []
  return state.partners
    .filter((p) => p.type === 'DEALER' || p.type === 'FRANCHISE')
    .filter((p) => p.stage !== 'IN_DECISION')
    .map((p) => {
      const c = cur.find((r) => r.key === p.id) || { revenue: 0, margin: 0, orders: 0, qty: 0, marginPct: 0 }
      const pr = prev.find((r) => r.key === p.id) || { revenue: 0 }
      const t = targets.find((x) => x.ownerType === 'DEALER' && x.ownerId === p.id && x.periodType === 'MONTH' && x.period === curM)
      const mRev = monthRev.find((r) => r.key === p.id)?.revenue || 0
      const ach = t?.amount ? round2((mRev / t.amount) * 100) : null
      const slab = t ? [...(t.slabs || [])].sort((a, b) => a.achievePct - b.achievePct).filter((s) => ach >= s.achievePct).pop() : null
      return {
        id: p.id, name: p.name, city: p.city, region: p.region, tier: p.tier || '—', type: p.type, status: p.status, salespersonId: p.salespersonId,
        revenue: c.revenue, prevRevenue: pr.revenue, growth: pctChange(c.revenue, pr.revenue), margin: c.margin, marginPct: c.marginPct, orders: c.orders,
        aov: c.orders ? round2(c.revenue / c.orders) : 0, share: total ? round2((c.revenue / total) * 100) : 0, lastOrderDate: p.lastOrderDate,
        target: t?.amount || null, monthRevenue: mRev, achievement: ach, incentivePct: slab?.incentivePct || 0, incentive: slab ? round2((mRev * slab.incentivePct) / 100) : 0,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

export const monthlyFor = (state, n, filter) => {
  const months = lastMonths(n)
  const lines = salesLines(state, { from: `${months[0]}-01` }).filter(filter || (() => true))
  const agg = Object.fromEntries(aggregate(lines, (l) => l.month).map((r) => [r.key, r]))
  return months.map((m) => ({ month: m, label: monthLabel(m), revenue: agg[m]?.revenue || 0, margin: agg[m]?.margin || 0, qty: agg[m]?.qty || 0, orders: agg[m]?.orders || 0 }))
}

export const inventoryView = (state) => {
  const fms = fmsMap(state, 90)
  const rows = state.products.filter((p) => p.active).map((p) => {
    const oh = onHand(state, p.id)
    const perDay = (fms[p.id]?.perMonth || 0) / 30
    return { ...p, onHand: oh, value: totalOnHand(state, p.id) * p.landedCost, fms: fms[p.id]?.cls || 'S', perMonth: fms[p.id]?.perMonth || 0, cover: perDay ? Math.round(oh / perDay) : null, breach: oh < p.reorderLevel }
  })
  const byCat = {}
  for (const r of rows) {
    const c = (byCat[r.category] = byCat[r.category] || { category: r.category, value: 0, onHand: 0, perDay: 0, breaches: 0, items: 0 })
    c.value += r.value
    c.items++
    c.breaches += r.breach ? 1 : 0
    c.perDay += (r.perMonth / 30) * r.landedCost
  }
  const cats = Object.values(byCat).map((c) => ({ ...c, cover: c.perDay ? Math.round(c.value / c.perDay) : null }))
  return { rows, cats, fmsCount: { F: rows.filter((r) => r.fms === 'F').length, M: rows.filter((r) => r.fms === 'M').length, S: rows.filter((r) => r.fms === 'S').length }, breaches: rows.filter((r) => r.breach) }
}
