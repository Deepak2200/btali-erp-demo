// Module seed for "procurement": freight RFQs (with forwarder quote history), direct export orders, price list versions.
import { addDays, daysAgo, round2, makeAttachment } from '../../lib/format'
import { buildExportLegs } from '../slices/procurement'

const iso = (d, h = 10) => `${d}T${String(h).padStart(2, '0')}:20:00.000Z`
const ex = (thc, doc, other = 0) => [
  { label: 'Destination THC', amount: thc, currency: 'INR' },
  { label: 'DO & documentation', amount: doc, currency: 'INR' },
  ...(other ? [{ label: 'BL / seal / misc.', amount: other, currency: 'INR' }] : []),
]
const quote = (id, forwarderId, rate, currency, transitDays, freeDays, extraCharges, validityDays, remarks, receivedAt) => ({ id, forwarderId, rate, currency, transitDays, freeDays, extraCharges, validity: addDays(receivedAt, validityDays), remarks, receivedAt: iso(receivedAt) })

export const procurementSeed = (core) => {
  const R = 'Ningbo → Nhava Sheva'
  // historical approved RFQs (rate history for bargaining)
  const hist = [
    { id: 'rfqh1', number: 'RFQ/25-26/0031', route: 'Shanghai → Nhava Sheva', poIds: [], shipmentId: null, containerType: '40FT', back: 330, rates: [['fw1', 2150, 26], ['fw2', 2240, 28], ['fw3', 2190, 25]], sel: 'fw1' },
    { id: 'rfqh2', number: 'RFQ/25-26/0038', route: R, poIds: [], shipmentId: null, containerType: '40HC', back: 270, rates: [['fw1', 2080, 24], ['fw3', 2010, 26], ['fw4', 1960, 31]], sel: 'fw3' },
    { id: 'rfqh3', number: 'RFQ/25-26/0044', route: 'Shanghai → Nhava Sheva', poIds: ['po10'], shipmentId: 'sh4', containerType: '40FT', back: 160, rates: [['fw1', 1950, 25], ['fw2', 2050, 27], ['fw4', 1990, 30]], sel: 'fw1' },
    { id: 'rfqh4', number: 'RFQ/26-27/0005', route: R, poIds: ['po9'], shipmentId: 'sh3', containerType: '40HC', back: 72, rates: [['fw1', 1680, 25], ['fw3', 1720, 24], ['fw4', 1640, 32]], sel: 'fw1' },
    { id: 'rfqh5', number: 'RFQ/26-27/0006', route: 'Shanghai → Nhava Sheva', poIds: ['po8'], shipmentId: 'sh2', containerType: '40FT', back: 40, rates: [['fw1', 1720, 26], ['fw2', 1810, 27], ['fw3', 1760, 25]], sel: 'fw1' },
    { id: 'rfq0', number: 'RFQ/26-27/0007', route: R, poIds: ['po7'], shipmentId: 'sh1', containerType: '40HC', back: 24, rates: [['fw1', 1850, 25], ['fw3', 1890, 24], ['fw4', 1795, 33]], sel: 'fw1' },
  ].map((h) => {
    const d = daysAgo(h.back)
    const quotes = h.rates.map(([fw, rate, t], i) => quote(`${h.id}q${i}`, fw, rate, 'USD', t, fw === 'fw4' ? 7 : 14, ex(fw === 'fw1' ? 14500 : 16000, 5500, fw === 'fw4' ? 0 : 2500), 21, fw === 'fw4' ? 'Via Colombo transhipment' : 'Direct service', addDays(d, 2 + i)))
    const selQ = quotes.find((q) => q.forwarderId === h.sel)
    return {
      id: h.id, number: h.number, route: h.route, poIds: h.poIds, shipmentId: h.shipmentId, containerType: h.containerType, cargoReadyDate: addDays(d, 10), notes: '',
      quotes, invited: h.rates.map((r) => r[0]), recommendedQuoteId: selQ.id, selectedQuoteId: selQ.id, selectedForwarderId: h.sel, status: 'APPROVED',
      createdAt: iso(d), createdBy: 'u3', submittedAt: iso(addDays(d, 5)), submittedBy: 'u3', approvedAt: iso(addDays(d, 6), 15), approvedBy: 'u1',
      recommendationNote: h.sel === 'fw1' ? 'Best balance of rate, transit time and free days' : 'Lowest landed freight', decisionRemark: 'Approved',
      history: [{ ts: iso(d), text: 'RFQ created' }, { ts: iso(addDays(d, 5)), text: 'Recommended and sent for Director approval' }, { ts: iso(addDays(d, 6), 15), text: 'Approved' }],
    }
  })

  const d1 = daysAgo(6)
  const pending = {
    id: 'rfq1', number: 'RFQ/26-27/0009', route: R, poIds: ['po6'], shipmentId: null, containerType: '40HC', cargoReadyDate: daysAgo(5), notes: 'PO/26-27/0094 ready at factory – 1 x 40HC, 1,060 pcs',
    quotes: [
      quote('rfq1qa', 'fw1', 1780, 'USD', 24, 14, ex(14500, 5500, 2500), 14, 'Weekly direct sailing, Thursday cut-off', addDays(d1, 1)),
      quote('rfq1qb', 'fw3', 1720, 'USD', 26, 21, ex(16000, 4500, 3000), 10, 'Includes 21 free days at CFS', addDays(d1, 2)),
      quote('rfq1qc', 'fw4', 1655, 'USD', 33, 7, ex(18500, 6500, 4000), 7, 'Transhipment via Colombo; space subject to availability', addDays(d1, 2)),
    ],
    invited: ['fw1', 'fw3', 'fw4'], recommendedQuoteId: 'rfq1qb', selectedForwarderId: null, status: 'PENDING_APPROVAL', createdAt: iso(d1), createdBy: 'u3',
    submittedAt: iso(daysAgo(1), 11), submittedBy: 'u3', recommendationNote: 'GAF: 21 free days avoids detention; only 2 days slower than Oceanlink and ₹4,000 cheaper overall',
    history: [{ ts: iso(d1), text: 'RFQ created' }, { ts: iso(d1, 11), text: 'RFQ emailed to 3 forwarder(s)' }, { ts: iso(daysAgo(1), 11), text: 'Recommended GAF Logistics and sent for Director approval' }],
  }
  const open = {
    id: 'rfq2', number: 'RFQ/26-27/0008', route: 'Taizhou (Ningbo port) → Nhava Sheva', poIds: ['po4'], shipmentId: null, containerType: '40FT', cargoReadyDate: addDays(daysAgo(0), 10), notes: 'Compressors – heavy cargo, check weight limit',
    quotes: [quote('rfq2qa', 'fw1', 1820, 'USD', 25, 14, ex(14500, 5500), 14, 'Space confirmed for next week', daysAgo(1))],
    invited: ['fw1', 'fw2', 'fw3'], recommendedQuoteId: null, selectedForwarderId: null, status: 'OPEN', createdAt: iso(daysAgo(2)), createdBy: 'u3',
    history: [{ ts: iso(daysAgo(2)), text: 'RFQ created' }, { ts: iso(daysAgo(2), 12), text: 'RFQ emailed to 3 forwarder(s)' }],
  }

  // ------------------------------------------------ export orders
  const prod = (id) => core.products.find((p) => p.id === id)
  const mkLines = (spec, m) => spec.map(([pid, qty]) => {
    const vc = prod(pid).vendorRate
    return { productId: pid, qty, vendorCost: vc, price: round2(vc * (1 + m / 100)) }
  })
  const tot = (ls) => round2(ls.reduce((a, l) => a + l.qty * l.price, 0))
  const cost = (ls) => round2(ls.reduce((a, l) => a + l.qty * l.vendorCost, 0))

  const l1 = mkLines([['p20', 400], ['p21', 200], ['p37', 150]], 22)
  const e1 = { id: 'exp1', number: 'EXP/26-27/0006', customerId: 'x2', vendorId: 'v5', date: daysAgo(3), currency: 'USD', fxRate: 83.6, marginPct: 22, lines: l1, total: tot(l1), cost: cost(l1), status: 'QUOTED', advancePct: 30, advanceReceived: false, fullPaid: false, payments: [], poId: null, incoterm: 'CIF', port: 'Chattogram', notes: 'Monsoon season sprayer order', legs: buildExportLegs(daysAgo(3), 'fw6'), telexReleased: false, invoiceNo: null, fxGainLoss: 0, createdBy: 'u3', quoteSentAt: iso(daysAgo(3), 15), timeline: [{ ts: iso(daysAgo(3)), text: 'Quotation prepared – vendor cost + 22% margin' }, { ts: iso(daysAgo(3), 15), text: 'Quotation emailed to mahmud@dhakaeng.bd' }] }

  const d2 = daysAgo(34)
  const l2 = mkLines([['p2', 250], ['p1', 200], ['p25', 1000]], 20)
  const legs2 = buildExportLegs(d2, 'fw5')
  legs2[0].milestones[0] = { ...legs2[0].milestones[0], done: true, date: addDays(d2, 31) }
  const t2 = tot(l2)
  const adv2 = round2(t2 * 0.3)
  const e2 = { id: 'exp2', number: 'EXP/26-27/0005', customerId: 'x1', vendorId: 'v1', date: d2, currency: 'USD', fxRate: 83.4, marginPct: 20, lines: l2, total: t2, cost: cost(l2), status: 'IN_PRODUCTION', advancePct: 30, advanceReceived: true, fullPaid: false, payments: [{ id: 'xp1', kind: 'ADVANCE', amountUSD: adv2, fxRate: 83.55, ref: 'SWIFT LKCB2609-4471', date: addDays(d2, 4) }], paidUSD: adv2, poId: null, poNumber: 'PO/26-27/0102', incoterm: 'CIF', port: 'Colombo', notes: 'Repeat order – Lanka Agro', legs: legs2, telexReleased: false, invoiceNo: null, fxGainLoss: round2(adv2 * (83.55 - 83.4)), createdBy: 'u3', quoteSentAt: iso(d2, 15), timeline: [{ ts: iso(d2), text: 'Quotation prepared – vendor cost + 20% margin' }, { ts: iso(d2, 15), text: 'Quotation emailed to dinuka@lankaagro.lk' }, { ts: iso(addDays(d2, 4)), text: `Advance USD ${adv2.toLocaleString('en-US')} received @ ₹83.55 – advance condition met` }, { ts: iso(addDays(d2, 5)), text: 'Vendor PO PO/26-27/0102 released to Ningbo Hailong' }, { ts: iso(addDays(d2, 31)), text: 'CHINA leg – Cargo ready at factory completed' }] }

  const d3 = daysAgo(110)
  const l3 = mkLines([['p16', 120], ['p17', 60], ['p33', 200]], 22)
  const t3 = tot(l3)
  const legs3 = buildExportLegs(d3, 'fw5').map((lg, li) => ({ ...lg, milestones: lg.milestones.map((m, mi) => ({ ...m, done: true, date: addDays(m.planned, li === 1 && mi === 2 ? 3 : li === 2 && mi === 0 ? 2 : 0) })) }))
  const pays3 = [{ id: 'xp2', kind: 'ADVANCE', amountUSD: round2(t3 * 0.3), fxRate: 83.1, ref: 'SWIFT NABIL-2607-118', date: addDays(d3, 3) }, { id: 'xp3', kind: 'BALANCE', amountUSD: round2(t3 - round2(t3 * 0.3)), fxRate: 83.75, ref: 'SWIFT NABIL-2609-552', date: addDays(d3, 60) }]
  const e3 = { id: 'exp3', number: 'EXP/26-27/0004', customerId: 'x3', vendorId: 'v4', date: d3, currency: 'USD', fxRate: 83.2, marginPct: 22, lines: l3, total: t3, cost: cost(l3), status: 'CLOSED', advancePct: 30, advanceReceived: true, fullPaid: true, payments: pays3, paidUSD: t3, poId: null, poNumber: 'PO/26-27/0092', incoterm: 'CIF', port: 'Kolkata (for Birgunj ICD)', notes: '', legs: legs3, telexReleased: true, telexAt: iso(addDays(d3, 61)), invoiceNo: 'BTX/26-27/0040', invoiceDate: addDays(d3, 37), fxGainLoss: round2(pays3.reduce((a, p) => a + p.amountUSD * p.fxRate, 0) - t3 * 83.2), createdBy: 'u3', closedAt: iso(addDays(d3, 66)), timeline: [{ ts: iso(d3), text: 'Quotation prepared – vendor cost + 22% margin' }, { ts: iso(addDays(d3, 3)), text: 'Advance received – vendor PO PO/26-27/0092 released' }, { ts: iso(addDays(d3, 37)), text: 'Export invoice BTX/26-27/0040 issued (USD)' }, { ts: iso(addDays(d3, 60)), text: 'Balance received – fully paid' }, { ts: iso(addDays(d3, 61)), text: 'Telex release issued' }, { ts: iso(addDays(d3, 66)), text: 'Order closed' }] }

  // ------------------------------------------------ price list version history
  const pls = core.priceLists.filter((p) => ['pl1', 'pl2', 'pl3'].includes(p.id))
  const snap = (factor) => core.products.map((p) => {
    const mrp = Math.round((p.mrp * factor) / 10) * 10
    const r = { productId: p.id, sku: p.sku, name: p.shortName, landedCost: Math.round(p.landedCost * factor), mrp }
    for (const pl of pls) r[pl.id] = round2(mrp * (1 - pl.baseDiscountPct / 100))
    return r
  })
  const ver = (id, number, back, versions, note, trigger, leadDays, factor, ids = ['pl1', 'pl2']) => ({ id, number, date: daysAgo(back), ts: iso(daysAgo(back), 17), publishedBy: 'u3', priceListIds: ids, versions, note, trigger, leadDays, productCount: core.products.length, belowTarget: Math.round(3 * factor), rows: snap(factor) })
  const priceListVersions = [
    ver('plv5', 'PLV-005', 18, { pl1: 3, pl2: 3 }, 'Sprayer landed cost revised after SH/26-27/0019', 'Landed cost finalised – SH/26-27/0019', 5, 1),
    ver('plv4', 'PLV-004', 40, { pl3: 2 }, 'Franchise transfer price aligned to 55% base', 'Franchise margin review', 3, 0.99, ['pl3']),
    ver('plv3', 'PLV-003', 112, { pl1: 2, pl2: 2 }, 'Vacuum range updated after SH/25-26/0015', 'Landed cost finalised – SH/25-26/0015', 4, 0.97),
    ver('plv2', 'PLV-002', 190, { pl1: 1, pl2: 1, pl3: 1 }, 'FY 2026-27 opening price list', 'Annual revision', 9, 0.95, ['pl1', 'pl2', 'pl3']),
    ver('plv1', 'PLV-001', 300, { pl1: 0, pl2: 0 }, 'Initial ERP price list migrated from Excel', 'Migration', 12, 0.93),
  ]

  // Back-to-back vendor POs for the released export orders (type EXPORT, linked both ways)
  const exportPO = (o, id, status) => {
    if (core.purchaseOrders.some((p) => p.id === id)) return
    const lines = o.lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.vendorCost, mrp: prod(l.productId).mrp }))
    const v = core.vendors.find((x) => x.id === o.vendorId)
    const date = addDays(o.date, 2)
    core.purchaseOrders.push({
      id, number: o.poNumber, type: 'EXPORT', vendorId: o.vendorId, date, status, currency: 'USD', lines, paymentTerms: v?.paymentTerms,
      createdBy: 'u3', approvedBy: 'u1', approvedAt: iso(addDays(date, 1)), source: 'EXPORT_ORDER', note: `Back-to-back for ${o.number} – direct shipment to customer`,
      pi: { number: `${v?.code}-PI-EXP-${o.number.slice(-4)}`, amount: round2(lines.reduce((a, l) => a + l.qty * l.rate, 0)), file: makeAttachment(`PI-${v?.code}-EXP-${o.number.slice(-4)}.pdf`), uploadedAt: iso(addDays(date, 3)), status: 'APPROVED', approvedAt: iso(addDays(date, 4)) },
      mrpConfirmed: true, labelsSent: true, barcodesGenerated: false, stickerConfirmed: true, deliverySchedule: [], qc: [], improvements: [], docs: [],
      requiresCustomerPayment: true, linkedSoId: null, customerPaid: true, exportOrderId: o.id,
      timeline: [{ ts: iso(date), text: `Released after customer advance for ${o.number}` }, { ts: iso(addDays(date, 1)), text: 'Approved; sent to vendor' }],
    })
    o.poId = id
  }
  exportPO(e2, 'po_exp5', 'IN_PRODUCTION')
  exportPO(e3, 'po_exp4', 'CLOSED')

  return { freightRfqs: [pending, open, ...hist.reverse()], exportOrders: [e1, e2, e3], priceListVersions }
}
