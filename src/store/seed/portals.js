// Module seed for "portals" (dealer portal + franchise POS).
// Returns NEW collections: carts, posSessions, posOrders, replenishments.
// Also appends a few portal-specific records to core collections (orders, invoices, receipts, barcoded units)
// so the dealer / franchise journeys have live data to work with (same pattern as the vendor seed).
import { addDays, daysAgo, round2, sum, today, makeAttachment, mulberry32 } from '../../lib/format'
import { priceOrder } from '../../lib/pricing'

const iso = (d, h = 10, m = 15) => `${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
const pad = (n, w = 4) => String(n).padStart(w, '0')

const POS_CUSTOMERS = [
  ['Ramesh Gaikwad', '98220 45110', 'Pune'], ['Ajay Deshmukh', '98230 66012', 'Pune'], ['Swati Kulkarni', '98901 22341', 'Pune'], ['Nilesh Jagtap', '97654 11209', 'Hadapsar'],
  ['Shinde Car Care', '98500 77120', 'Pune'], ['Prakash Borate', '98224 90311', 'Loni Kalbhor'], ['Meenal Joshi', '98810 23145', 'Pune'], ['Sai Garden Nursery', '98600 45672', 'Manjari'],
  ['Kiran Patel', '98250 77801', 'Ahmedabad'], ['Hiren Shah', '98790 11223', 'Ahmedabad'], ['Sunita Rao', '98450 22018', 'Bengaluru'], ['Manjunath K', '99000 12233', 'Peenya'],
  ['Mohd. Arif', '98390 11220', 'Lucknow'], ['Rakesh Yadav', '94150 88231', 'Lucknow'], ['Neha Srivastava', '94500 66110', 'Lucknow'],
]

export const portalsSeed = (core) => {
  const rnd = mulberry32(4242)
  const S = core.settings
  const P = (id) => core.products.find((p) => p.id === id)
  const partner = (id) => core.partners.find((p) => p.id === id)
  const f1 = partner('f1')
  const d1 = partner('d1')

  // ---------------------------------------------------------------- helpers to append core docs
  const newUnit = (productId, extra) => {
    const p = P(productId)
    const ser = S.barcodeSeries[p.category]
    const code = `${ser.prefix}${String(ser.next).padStart(6, '0')}`
    ser.next += 1
    const u = { code, productId, poId: 'po10', vendorId: p.vendorId, status: 'AT_PARTNER', locationId: null, partnerId: null, invoiceId: null, history: [], ...extra }
    core.units.push(u)
    return u
  }
  const makeOrderChain = ({ soId, invId, partnerId, date, spec, invoice = true, lrDate, inward, note = '', source = 'SALES', unitsFor = [] }) => {
    const pt = partner(partnerId)
    const priced = priceOrder(core, partnerId, spec.map(([productId, qty]) => ({ productId, qty })), date)
    S.series.SO += 1
    const so = {
      id: soId, number: `SO/26-27/${pad(S.series.SO)}`, partnerId, date, source, salespersonId: pt.salespersonId, lines: priced.lines, subtotal: priced.subtotal, gst: priced.gst, total: priced.total,
      appliedSchemes: priced.appliedSchemes, status: 'CONFIRMED', paymentStatus: 'UNPAID', paidAmount: 0, warehouseId: 'WH-STAREX', transporterId: pt.transporterId, note,
      timeline: [{ ts: iso(date, 10), text: source === 'PORTAL' ? 'Placed via Dealer Portal – awaiting Sales review' : 'Order created & confirmed' }],
    }
    core.salesOrders.push(so)
    if (!invoice) return { so }
    // paid
    S.series.RCPT += 1
    core.receipts.push({ id: `rc_${soId}`, number: `RCPT/${pad(S.series.RCPT)}`, partnerId, soId, amount: so.total, mode: 'NEFT', ref: `UTR${String(7.1e10 + S.series.RCPT * 613).slice(0, 12)}`, date, bankId: 'bk1', recordedBy: 'u9' })
    so.paymentStatus = 'PAID'
    so.paidAmount = so.total
    so.timeline.push({ ts: iso(date, 14), text: `Payment received (NEFT) – fully paid, ready for invoice` })
    // invoice + units
    const invDate = addDays(date, 1)
    S.series.INV += 1
    const number = `BT/26-27/${pad(S.series.INV)}`
    const units = []
    for (const [productId, qty] of spec) {
      if (!unitsFor.includes(productId)) continue
      for (let i = 0; i < qty; i++) {
        const u = newUnit(productId, { partnerId, locationId: partnerId, invoiceId: invId })
        u.history.push({ ts: iso(addDays(date, -60)), event: 'Inward scanned at Starex', ref: 'GRN/26-27/0019' })
        u.history.push({ ts: iso(invDate, 11), event: `Invoiced on ${number}`, ref: number })
        u.history.push({ ts: iso(lrDate, 16), event: `Dispatched to ${pt.name}`, ref: number })
        if (inward) u.history.push({ ts: iso(inward.date, 12), event: `Inward scanned at ${pt.name}`, ref: number })
        units.push(u.code)
      }
    }
    const tr = core.transporters.find((t) => t.id === pt.transporterId)
    const inv = {
      id: invId, number, soId, partnerId, date: invDate, lines: so.lines, subtotal: so.subtotal, gst: so.gst, total: so.total, transporterId: pt.transporterId, vehicleNo: tr?.vehicleNo || '',
      status: 'DISPATCHED', lr: { number: `LR${700000 + S.series.INV * 13}`, date: lrDate, uploadedBy: 'u8', uploadedAt: iso(lrDate, 17), file: makeAttachment(`LR-${700000 + S.series.INV * 13}.pdf`) },
      dispatchDate: lrDate, sentToStarex: true, emailed: true, irn: `IRN${String(9.6e9 + S.series.INV * 41)}`, ewayBill: String(3.95e11 + S.series.INV * 23).slice(0, 12), type: 'TAX', units,
      inward: inward ? { acknowledged: true, date: inward.date, ackAt: iso(inward.date, 12), by: inward.by, scanned: units, lines: so.lines.map((l) => ({ productId: l.productId, expected: l.qty, received: l.qty, damaged: 0 })), remarks: 'All items received in good condition' } : null,
    }
    core.invoices.push(inv)
    so.status = 'DISPATCHED'
    so.invoiceId = invId
    so.timeline.push({ ts: iso(invDate, 11), text: `Invoice ${number} generated · emailed to client · pushed to Starex schedule` })
    so.timeline.push({ ts: iso(lrDate, 17), text: `Dispatched – LR ${inv.lr.number} uploaded & emailed to client` })
    if (inward) {
      so.status = 'DELIVERED'
      so.timeline.push({ ts: iso(inward.date, 12), text: 'Goods received at store – inward scan complete' })
    }
    pt.stock = pt.stock || {}
    for (const l of so.lines) pt.stock[l.productId] = (pt.stock[l.productId] || 0) + l.qty
    pt.lastOrderDate = date > (pt.lastOrderDate || '') ? date : pt.lastOrderDate
    return { so, inv }
  }

  // ---------------------------------------------------------------- franchise f1 – received + in-transit consignments
  if (f1) {
    f1.stockMin = f1.stockMin || {}
    makeOrderChain({ soId: 'so_frn_1', invId: 'inv_frn_1', partnerId: 'f1', date: daysAgo(14), lrDate: daysAgo(12), inward: { date: daysAgo(10), by: 'u16' }, note: 'Festive season store stock', spec: [['p2', 3], ['p1', 2], ['p12', 2], ['p16', 3], ['p8', 2], ['p31', 10]], unitsFor: ['p2', 'p1', 'p12', 'p16', 'p8'] })
    makeOrderChain({ soId: 'so_frn_2', invId: 'inv_frn_2', partnerId: 'f1', date: daysAgo(4), lrDate: daysAgo(1), inward: null, note: 'Replenishment REP – auto-raised', spec: [['p16', 2], ['p17', 2], ['p20', 2], ['p13', 2], ['p37', 10]], unitsFor: ['p16', 'p17', 'p20', 'p13'] })
    for (const pid of ['p1', 'p2', 'p8', 'p12', 'p13', 'p16', 'p17', 'p20', 'p21']) f1.stockMin[pid] = f1.stockMin[pid] ?? 3
    // a few deliberately low items to drive replenishment suggestions
    f1.stock.p9 = 1; f1.stockMin.p9 = 2
    f1.stock.p28 = 4; f1.stockMin.p28 = 10
    f1.stock.p35 = 3; f1.stockMin.p35 = 10
    f1.stockUpdatedAt = today()
  }

  // ---------------------------------------------------------------- dealer d1 – awaiting payment + recent dispatch with barcoded units
  if (d1) {
    makeOrderChain({ soId: 'so_d1_disp', invId: 'inv_d1_disp', partnerId: 'd1', date: daysAgo(9), lrDate: daysAgo(7), inward: null, spec: [['p2', 5], ['p1', 3], ['p25', 50]], unitsFor: ['p2', 'p1'] })
    const { so } = makeOrderChain({ soId: 'so_d1_conf', invId: null, partnerId: 'd1', date: daysAgo(1), invoice: false, source: 'PORTAL', note: 'Diwali stock – washers & vacuums', spec: [['p16', 10], ['p12', 6], ['p33', 10]] })
    so.timeline.push({ ts: iso(daysAgo(1), 15), text: 'Reviewed & confirmed by Sales' })
    so.reviewedBy = 'u4'
    d1.stock = d1.stock || {}
    d1.stockMin = d1.stockMin || {}
    const base = { p1: 4, p2: 6, p3: 2, p4: 1, p5: 1, p20: 3, p21: 2, p25: 35, p27: 18, p26: 4 }
    for (const [pid, q] of Object.entries(base)) {
      d1.stock[pid] = Math.max(d1.stock[pid] || 0, q)
      d1.stockMin[pid] = d1.stockMin[pid] ?? (P(pid).type === 'SPARE' ? 25 : 3)
    }
    d1.stock.p4 = 1; d1.stock.p26 = 4
    d1.stockUpdatedAt = daysAgo(3)
  }

  // ---------------------------------------------------------------- POS sessions + orders
  const posSessions = []
  const posOrders = []
  const sold = core.units.filter((u) => u.status === 'SOLD' && u.partnerId?.startsWith('f') && u.saleDate && u.saleDate >= daysAgo(30))
  const fgPool = ['p1', 'p2', 'p6', 'p8', 'p11', 'p12', 'p13', 'p15', 'p16', 'p17', 'p19', 'p20', 'p21']
  const sparePool = ['p25', 'p27', 'p28', 'p31', 'p32', 'p33', 'p35', 'p36', 'p37', 'p38', 'p39']
  let posN = 0
  const mkOrder = (partnerId, date, sessionId, hour, presetLines, presetCustomer, warrantyIds = []) => {
    posN += 1
    let lines = presetLines
    if (!lines) {
      lines = []
      const nFg = rnd() < 0.7 ? 1 : 0
      for (let i = 0; i < nFg; i++) {
        const pid = fgPool[Math.floor(rnd() * fgPool.length)]
        const disc = rnd() < 0.3 ? 5 : 0
        const p = P(pid)
        lines.push({ productId: pid, barcode: null, qty: 1, mrp: p.mrp, discountPct: disc, price: round2(p.mrp * (1 - disc / 100)) })
      }
      const nSp = lines.length ? (rnd() < 0.4 ? 1 : 0) : 1 + Math.floor(rnd() * 2)
      for (let i = 0; i < nSp; i++) {
        const pid = sparePool[Math.floor(rnd() * sparePool.length)]
        if (lines.some((l) => l.productId === pid)) continue
        const p = P(pid)
        lines.push({ productId: pid, barcode: null, qty: 1 + Math.floor(rnd() * 3), mrp: p.mrp, discountPct: 0, price: p.mrp })
      }
    }
    const total = round2(sum(lines, (l) => l.qty * l.price))
    const r = rnd()
    const payments = r < 0.45 ? [{ method: 'UPI', amount: total }] : r < 0.75 ? [{ method: 'CASH', amount: total }] : r < 0.9 ? [{ method: 'CARD', amount: total }]
      : [{ method: 'CASH', amount: round2(Math.min(2000, total / 2)) }, { method: 'UPI', amount: round2(total - Math.min(2000, total / 2)) }]
    const c = presetCustomer || (lines.some((l) => P(l.productId).type === 'FG') || rnd() < 0.4 ? (() => { const [name, phone, city] = POS_CUSTOMERS[Math.floor(rnd() * POS_CUSTOMERS.length)]; return { name, phone, city } })() : null)
    const o = { id: `pos_s${posN}`, number: `POS-${pad(posN, 5)}`, partnerId, sessionId, date, ts: iso(date, hour, Math.floor(rnd() * 59)), lines, total, payments, customer: c, warrantyIds, synced: true }
    posOrders.push(o)
    return o
  }
  const soldOrder = (u, sessionId) => {
    const w = core.warranties.find((x) => x.barcode === u.code)
    const p = P(u.productId)
    return mkOrder(u.partnerId, u.saleDate, sessionId, 12, [{ productId: u.productId, barcode: u.code, qty: 1, mrp: p.mrp, discountPct: 0, price: p.mrp }], w?.customer ? { name: w.customer.name, phone: w.customer.phone, city: w.customer.city } : null, w ? [w.id] : [])
  }

  // f1: 6 closed sessions (none open today so the store opens a fresh one)
  const f1Days = [...new Set([1, 2, 3, 5, ...sold.filter((u) => u.partnerId === 'f1').map((u) => Math.round((new Date(today()) - new Date(u.saleDate)) / 86400000))])].sort((a, b) => a - b).slice(0, 6)
  while (f1Days.length < 6) f1Days.push(f1Days[f1Days.length - 1] + 1)
  const variances = [0, -50, 0, 20, 0, -200]
  f1Days.forEach((ago, i) => {
    const date = daysAgo(ago)
    const id = `ps_f1_${i + 1}`
    const opening = 2000
    const orders = []
    for (const u of sold.filter((x) => x.partnerId === 'f1' && x.saleDate === date)) orders.push(soldOrder(u, id))
    const n = 2 + Math.floor(rnd() * 3)
    for (let k = 0; k < n; k++) orders.push(mkOrder('f1', date, id, 11 + k * 2))
    const cash = sum(orders, (o) => sum(o.payments.filter((p) => p.method === 'CASH'), (p) => p.amount))
    const expected = round2(opening + cash)
    const counted = round2(expected + variances[i])
    posSessions.push({
      id, number: `SES-F1-${pad(100 - i, 3)}`, partnerId: 'f1', openedAt: iso(date, 4, 0), openedBy: 'u16', openingCash: opening, status: 'CLOSED', closedAt: iso(date, 14, 30), closedBy: 'u16',
      expectedCash: expected, countedCash: counted, variance: round2(counted - expected), note: variances[i] ? (variances[i] < 0 ? 'Short – change given in excess' : 'Excess – rounding') : '', salesTotal: round2(sum(orders, (o) => o.total)), bills: orders.length,
    })
  })
  // f2: one open session today + history orders
  posSessions.push({ id: 'ps_f2_open', number: 'SES-F2-061', partnerId: 'f2', openedAt: iso(today(), 4, 0), openedBy: null, openingCash: 3000, status: 'OPEN', closedAt: null, expectedCash: null, countedCash: null, variance: null, note: '' })
  for (const u of sold.filter((x) => x.partnerId === 'f2')) soldOrder(u, null)
  mkOrder('f2', today(), 'ps_f2_open', 5)
  mkOrder('f2', today(), 'ps_f2_open', 6)
  const others = { f2: 6, f3: 7, f4: 5 }
  for (const [pid, n] of Object.entries(others)) {
    for (let k = 0; k < n; k++) mkOrder(pid, daysAgo(1 + Math.floor(rnd() * 29)), null, 10 + (k % 7))
  }
  // keep numbering chronological
  posOrders.sort((a, b) => a.ts.localeCompare(b.ts))
  posOrders.forEach((o, i) => { o.number = `POS-${pad(i + 1, 5)}` })
  posOrders.reverse()
  S.series.POS = posOrders.length
  for (const o of posOrders) for (const wid of o.warrantyIds) { const w = core.warranties.find((x) => x.id === wid); if (w) w.invoiceRef = o.number }

  // ---------------------------------------------------------------- replenishments
  const rep = () => { S.series.REP = (S.series.REP || 0) + 1; return `REP/26-27/${pad(S.series.REP)}` }
  const below = f1 ? Object.entries(f1.stockMin || {}).filter(([pid, min]) => (f1.stock?.[pid] || 0) < min).slice(0, 5).map(([pid, min]) => ({ productId: pid, qty: Math.max(1, min * 2 - (f1.stock?.[pid] || 0)), stock: f1.stock?.[pid] || 0, min })) : []
  const replenishments = [
    { id: 'rp1', number: rep(), partnerId: 'f1', date: daysAgo(5), createdAt: iso(daysAgo(5), 9), auto: true, lines: [{ productId: 'p16', qty: 2 }, { productId: 'p17', qty: 2 }, { productId: 'p20', qty: 2 }, { productId: 'p13', qty: 2 }, { productId: 'p37', qty: 10 }], status: 'ORDERED', soId: 'so_frn_2', decidedAt: iso(daysAgo(4), 11), decidedBy: 'u4', remark: 'Approved – dispatch with next Pune truck', note: 'Auto-raised: 5 items below minimum after Diwali weekend sales', history: [{ ts: iso(daysAgo(5), 9), text: 'Auto-raised from POS sell-through' }, { ts: iso(daysAgo(4), 11), text: 'Approved by Sales – order SO created' }] },
    { id: 'rp2', number: rep(), partnerId: 'f1', date: today(), createdAt: iso(today(), 6), auto: true, lines: below.length ? below.map(({ productId, qty }) => ({ productId, qty })) : [{ productId: 'p9', qty: 3 }, { productId: 'p28', qty: 16 }], status: 'REQUESTED', soId: null, note: 'Auto-raised: items below store minimum', history: [{ ts: iso(today(), 6), text: 'Auto-raised from POS sell-through' }] },
    { id: 'rp3', number: rep(), partnerId: 'f3', date: daysAgo(1), createdAt: iso(daysAgo(1), 12), auto: false, lines: [{ productId: 'p12', qty: 4 }, { productId: 'p13', qty: 2 }, { productId: 'p31', qty: 20 }], status: 'REQUESTED', soId: null, note: 'Vacuum demand from Peenya workshops – please expedite', history: [{ ts: iso(daysAgo(1), 12), text: 'Requested by store manager' }] },
    { id: 'rp4', number: rep(), partnerId: 'f4', date: daysAgo(9), createdAt: iso(daysAgo(9), 10), auto: false, lines: [{ productId: 'p18', qty: 3 }], status: 'REJECTED', soId: null, decidedAt: iso(daysAgo(8), 16), decidedBy: 'u4', remark: 'Commercial washers not stocked at Lucknow store – route via dealer Ganga Sales', note: 'Customer enquiry for 3 kW washer', history: [{ ts: iso(daysAgo(9), 10), text: 'Requested by store manager' }, { ts: iso(daysAgo(8), 16), text: 'Rejected by Sales' }] },
  ]
  const so2 = core.salesOrders.find((s) => s.id === 'so_frn_2')
  if (so2) so2.note = `Replenishment ${replenishments[0].number}`

  return {
    carts: { d1: [{ productId: 'p20', qty: 10 }, { productId: 'p37', qty: 10 }] },
    posSessions,
    posOrders,
    replenishments,
  }
}
