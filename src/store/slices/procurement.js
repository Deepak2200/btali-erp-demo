// Store actions for the "procurement" module: freight RFQs, landed cost drafts, order documents, inward settlements,
// price list publishing, direct export orders, masters (products, vendors, transporters, locations, warranty rules) and stock moves.
import { nowISO, today, uid, round2, sum, fmtINR, makeAttachment, addDays } from '../../lib/format'
import { priceListRow } from '../../lib/pricing'

const fxOf = (s, cur) => s.settings.fx?.[cur] ?? 1
/** INR value of a forwarder quote incl. extra charges */
export const rfqQuoteINR = (q, fx) => round2((Number(q.rate) || 0) * (fx[q.currency] ?? 1) + sum(q.extraCharges || [], (c) => (Number(c.amount) || 0) * (fx[c.currency || 'INR'] ?? 1)))

const EXPORT_LEGS = {
  CHINA: ['Cargo ready at factory', 'Container stuffed & sealed', 'Departed China port'],
  INDIA: ['Arrived Nhava Sheva (transhipment)', 'Switch BL & documents issued', 'Departed India'],
  DESTINATION: ['Arrived destination port', 'Telex / delivery order released', 'Customs cleared & delivered'],
}
const LEG_OFFSETS = { CHINA: [30, 34, 37], INDIA: [47, 49, 52], DESTINATION: [58, 60, 63] }
export const buildExportLegs = (date, destForwarderId) => ['CHINA', 'INDIA', 'DESTINATION'].map((leg) => ({
  leg,
  forwarderId: leg === 'CHINA' ? 'fw1' : leg === 'INDIA' ? 'fw3' : destForwarderId,
  milestones: EXPORT_LEGS[leg].map((label, i) => ({ label, planned: addDays(date, LEG_OFFSETS[leg][i]), date: null, done: false })),
}))

export const procurementSlice = (set, get) => ({
  // ------------------------------------------------------------ freight RFQs
  createRfq: ({ route, poIds = [], shipmentId = null, containerType = '40HC', cargoReadyDate = '', notes = '' }) => {
    const number = get().nextNo('RFQ')
    const rfq = { id: uid('rfq'), number, route, poIds, shipmentId, containerType, cargoReadyDate, notes, quotes: [], invited: [], recommendedQuoteId: null, selectedForwarderId: null, status: 'OPEN', createdAt: nowISO(), createdBy: get().session.userId, history: [{ ts: nowISO(), text: 'RFQ created' }] }
    set((s) => ({ freightRfqs: [rfq, ...(s.freightRfqs || [])] }))
    get().audit('Created freight RFQ', 'RFQ', number)
    return rfq
  },
  sendRfqToForwarders: (id, forwarderIds = []) => {
    const s = get()
    const r = s.freightRfqs.find((x) => x.id === id)
    for (const fid of forwarderIds) {
      const fw = s.vendors.find((v) => v.id === fid)
      if (!fw) continue
      get().sendEmail({ to: fw.email, subject: `Freight RFQ ${r.number} – ${r.route}`, body: `Dear ${fw.contact},\n\nPlease quote for 1 x ${r.containerType} on route ${r.route}${r.cargoReadyDate ? `, cargo ready ${r.cargoReadyDate}` : ''}.\nKindly include ocean freight, transit days, free days at destination, all local charges and validity.\n\nRegards,\nBtali Purchase`, ref: r.number, kind: 'RFQ' })
    }
    get().updateItem('freightRfqs', id, (x) => ({ ...x, invited: [...new Set([...(x.invited || []), ...forwarderIds])], history: [...(x.history || []), { ts: nowISO(), text: `RFQ emailed to ${forwarderIds.length} forwarder(s)` }] }))
  },
  addRfqQuote: (id, quote) => {
    const q = { id: uid('q'), receivedAt: nowISO(), extraCharges: [], ...quote, rate: Number(quote.rate) || 0, transitDays: Number(quote.transitDays) || 0, freeDays: Number(quote.freeDays) || 0 }
    const fw = get().vendors.find((v) => v.id === q.forwarderId)
    get().updateItem('freightRfqs', id, (x) => ({ ...x, quotes: [...x.quotes.filter((o) => o.id !== quote.id), q], history: [...(x.history || []), { ts: nowISO(), text: `Quote ${quote.id ? 'updated' : 'logged'} – ${fw?.name || ''} ${q.currency} ${q.rate}` }] }))
    return q
  },
  removeRfqQuote: (id, quoteId) => get().updateItem('freightRfqs', id, (x) => ({ ...x, quotes: x.quotes.filter((q) => q.id !== quoteId), recommendedQuoteId: x.recommendedQuoteId === quoteId ? null : x.recommendedQuoteId })),
  submitRfq: (id, quoteId, note = '') => {
    const s = get()
    const r = s.freightRfqs.find((x) => x.id === id)
    const q = r.quotes.find((x) => x.id === quoteId)
    const fw = s.vendors.find((v) => v.id === q?.forwarderId)
    get().updateItem('freightRfqs', id, (x) => ({ ...x, status: 'PENDING_APPROVAL', recommendedQuoteId: quoteId, recommendationNote: note, submittedAt: nowISO(), submittedBy: s.session.userId, history: [...(x.history || []), { ts: nowISO(), text: `Recommended ${fw?.name} and sent for Director approval${note ? ` – ${note}` : ''}` }] }))
    get().notify({ title: 'Forwarder selection awaiting approval', body: `${r.number} · ${r.route} · recommended ${fw?.name} (${fmtINR(rfqQuoteINR(q, s.settings.fx))})`, link: '/erp/purchase/freight', roles: ['ADMIN'] })
    get().audit('Submitted freight RFQ', 'RFQ', r.number)
  },
  reopenRfq: (id) => get().updateItem('freightRfqs', id, (x) => ({ ...x, status: 'OPEN', history: [...(x.history || []), { ts: nowISO(), text: 'Re-opened for fresh quotes' }] })),
  approveFreight: (id, approved = true, remark = '') => {
    const s = get()
    const r = s.freightRfqs.find((x) => x.id === id)
    if (!r) return
    const q = r.quotes.find((x) => x.id === r.recommendedQuoteId) || r.quotes[0]
    const fw = s.vendors.find((v) => v.id === q?.forwarderId)
    const by = s.session.userId
    if (!approved || !q) {
      get().updateItem('freightRfqs', id, (x) => ({ ...x, status: 'REJECTED', decisionRemark: remark, approvedBy: by, approvedAt: nowISO(), history: [...(x.history || []), { ts: nowISO(), text: `Rejected by Director – ${remark}` }] }))
      get().notify({ title: 'Forwarder selection rejected', body: `${r.number}: ${remark}`, link: '/erp/purchase/freight', roles: ['PURCHASE'] })
      get().audit('Rejected freight RFQ', 'RFQ', r.number)
      return
    }
    const totalINR = rfqQuoteINR(q, s.settings.fx)
    const shIds = new Set([r.shipmentId, ...s.purchaseOrders.filter((p) => r.poIds.includes(p.id)).map((p) => p.shipmentId)].filter(Boolean))
    const doc = makeAttachment(`Freight-Selection-${r.number.replace(/\//g, '-')}.pdf`, { docType: 'FREIGHT', uploadedBy: by })
    set((st) => ({
      freightRfqs: st.freightRfqs.map((x) => (x.id === id ? { ...x, status: 'APPROVED', selectedForwarderId: q.forwarderId, selectedQuoteId: q.id, approvedBy: by, approvedAt: nowISO(), decisionRemark: remark, history: [...(x.history || []), { ts: nowISO(), text: `Approved – ${fw?.name} selected${remark ? ` (${remark})` : ''}` }] } : x)),
      purchaseOrders: st.purchaseOrders.map((p) => (r.poIds.includes(p.id) ? { ...p, rfqId: id, forwarderId: q.forwarderId, docs: [...(p.docs || []), doc], timeline: [...(p.timeline || []), { ts: nowISO(), text: `Forwarder ${fw?.name} selected via ${r.number}` }] } : p)),
      shipments: st.shipments.map((x) => (shIds.has(x.id) ? { ...x, forwarderId: q.forwarderId, freight: { rate: q.rate, currency: q.currency, rfqId: id, totalINR }, landedCost: x.landedCost?.finalized ? x.landedCost : { ...(x.landedCost || {}), freightINR: Math.round(totalINR) } } : x)),
    }))
    const vendorIds = [...new Set(s.purchaseOrders.filter((p) => r.poIds.includes(p.id)).map((p) => p.vendorId))]
    for (const vid of vendorIds) {
      const v = s.vendors.find((x) => x.id === vid)
      const myPos = s.purchaseOrders.filter((p) => r.poIds.includes(p.id) && p.vendorId === vid)
      get().notify({ title: 'Freight forwarder assigned', body: `${myPos.map((p) => p.number).join(', ')}: ${fw?.name} (${fw?.contact}, ${fw?.phone}) will collect the container. Please coordinate stuffing.`, link: myPos[0] ? `/vendor/orders/${myPos[0].id}` : '/vendor/orders', vendorId: vid })
      get().sendEmail({ to: v?.email, subject: `Forwarder nominated for ${myPos.map((p) => p.number).join(', ')}`, body: `Dear ${v?.contact},\n\nBtali has nominated ${fw?.name} for this shipment (${r.containerType}, ${r.route}).\nContact: ${fw?.contact}, ${fw?.email}, ${fw?.phone}.\n\nRegards,\nBtali Purchase`, ref: r.number })
    }
    get().sendEmail({ to: fw?.email, subject: `Booking confirmation – ${r.number}`, body: `Dear ${fw?.contact},\n\nYour quote (${q.currency} ${q.rate}, ${q.transitDays} days transit) for ${r.route} is accepted. Please proceed with the booking.\n\nRegards,\nBtali Purchase`, attachments: [doc], ref: r.number })
    get().notify({ title: 'Forwarder selection approved', body: `${r.number} · ${fw?.name}`, link: '/erp/purchase/freight', roles: ['PURCHASE'] })
    get().audit('Approved freight RFQ', 'RFQ', r.number)
  },

  // ------------------------------------------------------------ landed cost / documents
  saveLandedDraft: (shipmentId, costs, method) => get().updateItem('shipments', shipmentId, (x) => ({ ...x, landedCost: { ...(x.landedCost || {}), ...costs, method, finalized: false, draftSavedAt: nowISO() } })),
  addPoDocuments: (poId, atts, docType) => {
    const by = get().session.userId
    const po = get().purchaseOrders.find((p) => p.id === poId)
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, docs: [...(x.docs || []), ...atts.map((a) => ({ ...a, docType, uploadedBy: by }))], timeline: [...(x.timeline || []), { ts: nowISO(), text: `${atts.length} document(s) added – ${docType}` }] }))
    get().audit('Uploaded order document', 'PO', `${po?.number} · ${docType}`)
  },
  removePoDocument: (poId, attId) => get().updateItem('purchaseOrders', poId, (x) => ({ ...x, docs: (x.docs || []).filter((d) => d.id !== attId) })),

  // ------------------------------------------------------------ inward discrepancies
  settleDiscrepancy: (shipmentId, index, { poId, note = '' }) => {
    const s = get()
    const sh = s.shipments.find((x) => x.id === shipmentId)
    const d = sh.inward.discrepancies[index]
    const p = s.products.find((x) => x.id === d.productId)
    const qty = Math.abs(d.received - d.expected)
    const po = s.purchaseOrders.find((x) => x.id === poId)
    const text = `${d.type === 'SHORT' ? `${qty} pcs ${p?.sku} short-shipped on ${sh.number} – vendor to supply free / credit` : `${qty} pcs ${p?.sku} excess on ${sh.number} – deduct from this order`}${note ? ` (${note})` : ''}`
    set((st) => ({
      shipments: st.shipments.map((x) => (x.id === shipmentId ? { ...x, inward: { ...x.inward, discrepancies: x.inward.discrepancies.map((y, i) => (i === index ? { ...y, settled: true, settledAt: nowISO(), settledPoId: poId, settleNote: note } : y)) } } : x)),
      purchaseOrders: st.purchaseOrders.map((x) => (x.id === poId ? { ...x, settlements: [...(x.settlements || []), { shipmentId, productId: d.productId, qty, type: d.type, note: text, date: today() }], note: `${x.note ? `${x.note}\n` : ''}Adjustment: ${text}`, timeline: [...(x.timeline || []), { ts: nowISO(), text: `Inward adjustment linked – ${text}` }] } : x)),
    }))
    if (po) get().notify({ title: 'Adjustment against your order', body: `${po.number}: ${text}`, link: `/vendor/orders/${po.id}`, vendorId: po.vendorId })
    get().audit('Settled inward discrepancy', 'Shipment', `${sh.number} → ${po?.number}`)
  },

  // ------------------------------------------------------------ price lists
  setPriceListOverride: (plId, productId, price) => set((s) => ({
    priceLists: s.priceLists.map((pl) => {
      if (pl.id !== plId) return pl
      const o = { ...(pl.overrides || {}) }
      if (price == null || price === '') delete o[productId]
      else o[productId] = Number(price)
      return { ...pl, overrides: o }
    }),
  })),
  publishPriceLists: ({ note = '', priceListIds = ['pl1', 'pl2', 'pl3'], trigger = '' } = {}) => {
    const s = get()
    const pls = s.priceLists.filter((p) => priceListIds.includes(p.id))
    const rows = s.products.filter((p) => p.active).map((p) => {
      const r = { productId: p.id, sku: p.sku, name: p.shortName, landedCost: p.landedCost, mrp: p.mrp }
      for (const pl of pls) r[pl.id] = pl.overrides?.[p.id] ?? priceListRow(p, pl, s.settings).dealerNet
      return r
    })
    const below = s.products.filter((p) => p.active && pls.some((pl) => pl.kind === 'DEALER' && priceListRow(p, pl, s.settings).belowTarget)).length
    const lastFinal = s.shipments.map((x) => x.landedCost?.finalizedAt).filter(Boolean).sort().pop()
    const leadDays = lastFinal ? Math.max(0, Math.round((Date.now() - new Date(lastFinal)) / 86400000)) : null
    const n = (s.priceListVersions || []).length + 1
    const versions = Object.fromEntries(pls.map((pl) => [pl.id, (pl.version || 0) + 1]))
    const rec = { id: uid('plv'), number: `PLV-${String(n).padStart(3, '0')}`, date: today(), ts: nowISO(), publishedBy: s.session.userId, priceListIds, versions, note, trigger, leadDays, productCount: rows.length, belowTarget: below, rows }
    set((st) => ({
      priceLists: st.priceLists.map((pl) => (priceListIds.includes(pl.id) ? { ...pl, version: versions[pl.id], publishedAt: today(), publishedBy: st.session.userId } : pl)),
      priceListVersions: [rec, ...(st.priceListVersions || [])],
    }))
    const dealers = s.partners.filter((p) => (p.type === 'DEALER' || p.type === 'FRANCHISE') && p.status === 'ACTIVE')
    get().sendEmail({ to: `${dealers.length} active dealers & franchise stores (BCC)`, cc: 'sales@btali.in', subject: `Btali revised price list ${rec.number} – effective ${today()}`, body: `Dear Partner,\n\nPlease find attached Btali's revised dealer price list (${pls.map((p) => `${p.name} v${versions[p.id]}`).join(', ')}), effective immediately. Live prices are also available on the Btali Dealer Portal.\n${note ? `\nNote: ${note}\n` : ''}\nRegards,\nBtali Sales`, attachments: [makeAttachment(`Btali-Price-List-${rec.number}.pdf`)], ref: rec.number, kind: 'PRICE_LIST' })
    get().notify({ title: 'New price list published', body: `${rec.number} · ${pls.map((p) => `${p.name} v${versions[p.id]}`).join(', ')}`, link: '/erp/sales/pricing', roles: ['SALES_MANAGER', 'SALES_EXEC', 'ADMIN'] })
    get().audit('Published price list', 'Price list', rec.number)
    return rec
  },

  // ------------------------------------------------------------ direct export orders
  createExportOrder: ({ customerId, vendorId, lines, marginPct, fxRate, advancePct = 30, incoterm = 'CIF', port = '', notes = '' }) => {
    const s = get()
    const cust = s.partners.find((p) => p.id === customerId)
    const number = get().nextNo('EXP')
    const ls = lines.filter((l) => l.productId && l.qty > 0).map((l) => ({ productId: l.productId, qty: Number(l.qty), vendorCost: Number(l.vendorCost), price: round2(Number(l.vendorCost) * (1 + marginPct / 100)) }))
    const total = round2(sum(ls, (l) => l.qty * l.price))
    const date = today()
    const o = { id: uid('exp'), number, customerId, vendorId, date, currency: 'USD', fxRate: Number(fxRate), marginPct: Number(marginPct), lines: ls, total, cost: round2(sum(ls, (l) => l.qty * l.vendorCost)), status: 'QUOTED', advancePct: Number(advancePct), advanceReceived: false, fullPaid: false, payments: [], poId: null, incoterm, port, notes, legs: buildExportLegs(date, cust?.country === 'Bangladesh' ? 'fw6' : 'fw5'), telexReleased: false, invoiceNo: null, fxGainLoss: 0, createdBy: s.session.userId, timeline: [{ ts: nowISO(), text: `Quotation prepared – vendor cost + ${marginPct}% margin` }] }
    set((st) => ({ exportOrders: [o, ...(st.exportOrders || [])] }))
    get().audit('Created export quote', 'Export', number)
    return o
  },
  sendExportQuote: (id) => {
    const s = get()
    const o = s.exportOrders.find((x) => x.id === id)
    const c = s.partners.find((p) => p.id === o.customerId)
    get().sendEmail({ to: c.email, subject: `Quotation ${o.number} – Btali International`, body: `Dear ${c.contact},\n\nPlease find our quotation ${o.number} for USD ${o.total.toLocaleString('en-US')} (${o.incoterm}${o.port ? ` ${o.port}` : ''}).\nPayment terms: ${o.advancePct}% advance to release the factory order, balance before telex release.\n\nRegards,\nBtali Export Desk`, attachments: [makeAttachment(`${o.number.replace(/\//g, '-')}-Quotation.pdf`)], ref: o.number })
    get().updateItem('exportOrders', id, (x) => ({ ...x, quoteSentAt: nowISO(), timeline: [...x.timeline, { ts: nowISO(), text: `Quotation emailed to ${c.email}` }] }))
  },
  recordExportPayment: (id, { amountUSD, fxRate, ref = '', date = today() }) => {
    const o = get().exportOrders.find((x) => x.id === id)
    const pay = { id: uid('xp'), amountUSD: Number(amountUSD), fxRate: Number(fxRate), ref, date, kind: o.payments?.length ? 'BALANCE' : 'ADVANCE' }
    const payments = [...(o.payments || []), pay]
    const paid = sum(payments, (p) => p.amountUSD)
    const advanceReceived = paid >= (o.total * o.advancePct) / 100 - 0.5
    const fullPaid = paid >= o.total - 0.5
    const fxGainLoss = round2(sum(payments, (p) => p.amountUSD * p.fxRate) - paid * o.fxRate)
    get().updateItem('exportOrders', id, (x) => ({ ...x, payments, paidUSD: round2(paid), advanceReceived, fullPaid, fxGainLoss, status: x.status === 'QUOTED' && advanceReceived ? 'ADVANCE_RECEIVED' : x.status, timeline: [...x.timeline, { ts: nowISO(), text: `Payment USD ${pay.amountUSD.toLocaleString('en-US')} received @ ₹${pay.fxRate}${fullPaid ? ' – fully paid' : advanceReceived ? ' – advance condition met' : ''}` }] }))
    get().notify({ title: 'Export payment received', body: `${o.number} · USD ${pay.amountUSD.toLocaleString('en-US')}`, link: '/erp/purchase/exports', roles: ['PURCHASE', 'ACCOUNTS', 'ADMIN'] })
    get().audit('Export payment', 'Export', o.number)
  },
  releaseExportPO: (id) => {
    const o = get().exportOrders.find((x) => x.id === id)
    if (!o.advanceReceived) return { ok: false, error: 'Advance not received from customer.' }
    const po = get().createPO({ type: 'EXPORT', vendorId: o.vendorId, lines: o.lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.vendorCost })), note: `Direct export order ${o.number}`, exportOrderId: id })
    get().updateItem('exportOrders', id, (x) => ({ ...x, poId: po.id, poNumber: po.number, status: 'PO_RELEASED', timeline: [...x.timeline, { ts: nowISO(), text: `Vendor PO ${po.number} released (awaiting Director approval)` }] }))
    return { ok: true, po }
  },
  updateExportMilestone: (id, legIdx, msIdx, done) => {
    get().updateItem('exportOrders', id, (x) => {
      const legs = x.legs.map((l, i) => (i !== legIdx ? l : { ...l, milestones: l.milestones.map((m, j) => (j === msIdx ? { ...m, done, date: done ? today() : null } : m)) }))
      const lastDone = legs[2].milestones.every((m) => m.done)
      const shipped = legs[0].milestones[2].done
      const status = ['CLOSED'].includes(x.status) ? x.status : lastDone ? 'DELIVERED' : shipped ? 'SHIPPED' : x.poId ? 'IN_PRODUCTION' : x.status
      const ms = legs[legIdx].milestones[msIdx]
      return { ...x, legs, status, timeline: [...x.timeline, { ts: nowISO(), text: `${legs[legIdx].leg} leg – ${ms.label} ${done ? 'completed' : 'reopened'}` }] }
    })
  },
  issueExportInvoice: (id) => {
    const s = get()
    const o = s.exportOrders.find((x) => x.id === id)
    const c = s.partners.find((p) => p.id === o.customerId)
    const n = (s.exportOrders || []).filter((x) => x.invoiceNo).length + 41
    const invoiceNo = `BTX/26-27/${String(n).padStart(4, '0')}`
    get().updateItem('exportOrders', id, (x) => ({ ...x, invoiceNo, invoiceDate: today(), timeline: [...x.timeline, { ts: nowISO(), text: `Export invoice ${invoiceNo} issued (USD)` }] }))
    get().sendEmail({ to: c.email, subject: `Commercial invoice ${invoiceNo} – ${o.number}`, body: `Dear ${c.contact},\n\nPlease find attached our commercial invoice ${invoiceNo} for USD ${o.total.toLocaleString('en-US')}.\n\nRegards,\nBtali Export Desk`, attachments: [makeAttachment(`${invoiceNo.replace(/\//g, '-')}.pdf`)], ref: o.number })
    return invoiceNo
  },
  releaseExportTelex: (id) => {
    const s = get()
    const o = s.exportOrders.find((x) => x.id === id)
    if (!o.fullPaid) return { ok: false, error: 'Full payment not received – telex release is blocked.' }
    const c = s.partners.find((p) => p.id === o.customerId)
    const dest = s.vendors.find((v) => v.id === o.legs[2]?.forwarderId)
    get().updateItem('exportOrders', id, (x) => ({ ...x, telexReleased: true, telexAt: nowISO(), timeline: [...x.timeline, { ts: nowISO(), text: 'Telex release issued to customer & destination agent' }] }))
    get().sendEmail({ to: `${c.email}, ${dest?.email || ''}`, subject: `Telex release – ${o.number}`, body: `Dear ${c.contact},\n\nTelex release has been issued for ${o.number}. ${dest?.name || 'Our destination agent'} will hand over the delivery order.\n\nRegards,\nBtali Export Desk`, attachments: [makeAttachment(`TELEX-${o.number.replace(/\//g, '-')}.pdf`)], ref: o.number })
    return { ok: true }
  },
  closeExportOrder: (id) => get().updateItem('exportOrders', id, (x) => ({ ...x, status: 'CLOSED', closedAt: nowISO(), timeline: [...x.timeline, { ts: nowISO(), text: 'Order closed' }] })),

  // ------------------------------------------------------------ masters
  upsertProduct: (data) => {
    const s = get()
    let id = data.id
    if (!id) {
      const max = Math.max(0, ...s.products.map((p) => Number(String(p.id).replace(/\D/g, '')) || 0))
      id = `p${max + 1}`
    }
    const exists = s.products.some((p) => p.id === id)
    set((st) => {
      let products = exists ? st.products.map((p) => (p.id === id ? { ...p, ...data, id } : p)) : [...st.products, { active: true, media: [], bom: [], parents: [], specs: {}, vendorIds: [data.vendorId].filter(Boolean), createdAt: today(), ...data, id }]
      products = products.map((p) => ({ ...p, parents: products.filter((f) => (f.bom || []).some((b) => b.productId === p.id)).map((f) => f.id) }))
      return { products }
    })
    get().audit(exists ? 'Updated product' : 'Created product', 'Product', data.sku)
    return id
  },
  setProductActive: (id, active) => {
    const p = get().updateItem('products', id, { active })
    get().audit(active ? 'Activated product' : 'Deactivated product', 'Product', p?.sku)
  },
  upsertVendor: (data) => {
    const s = get()
    let id = data.id
    if (!id) {
      const pre = { CHINA: 'v', INDIA: 'v', FORWARDER: 'fw', CHA: 'cha', LOGISTICS: 'lg' }[data.type] || 'v'
      const max = Math.max(0, ...s.vendors.filter((v) => new RegExp(`^${pre}\\d+$`).test(v.id)).map((v) => Number(v.id.replace(/\D/g, ''))))
      id = `${pre}${max + 1}`
      set((st) => ({ vendors: [...st.vendors, { rating: 4, categories: [], ...data, id }] }))
    } else get().updateItem('vendors', id, data)
    get().audit(data.id ? 'Updated vendor' : 'Created vendor', 'Vendor', data.name)
    return id
  },
  upsertTransporter: (data) => {
    if (data.id && get().transporters.some((t) => t.id === data.id)) get().updateItem('transporters', data.id, data)
    else {
      const max = Math.max(0, ...get().transporters.map((t) => Number(t.id.replace(/\D/g, '')) || 0))
      set((s) => ({ transporters: [...s.transporters, { regions: [], ...data, id: `t${max + 1}` }] }))
    }
    get().audit('Saved transporter', 'Transporter', data.name)
  },
  removeTransporter: (id) => {
    set((s) => ({ transporters: s.transporters.filter((t) => t.id !== id), partners: s.partners.map((p) => (p.transporterId === id ? { ...p, transporterId: null, safex: false } : p)) }))
  },
  setPartnerTransporter: (partnerId, transporterId) => {
    const t = get().transporters.find((x) => x.id === transporterId)
    get().updateItem('partners', partnerId, { transporterId: transporterId || null, safex: !!t?.isSafex })
  },
  upsertLocation: (data) => {
    if (data.id && get().locations.some((l) => l.id === data.id)) get().updateItem('locations', data.id, data)
    else set((s) => ({ locations: [...s.locations, { ...data, id: data.id || `WH-${String(data.code || 'LOC').toUpperCase().replace(/[^A-Z0-9]+/g, '-')}` }] }))
    get().audit('Saved location', 'Location', data.name)
  },
  upsertWarrantyRule: (data) => {
    if (data.id) get().updateItem('warrantyRules', data.id, data)
    else set((s) => ({ warrantyRules: [...s.warrantyRules, { ...data, id: uid('wr') }] }))
    get().audit('Saved warranty rule', 'Warranty', `${data.scope} ${data.ref}`)
  },
  removeWarrantyRule: (id) => set((s) => ({ warrantyRules: s.warrantyRules.filter((r) => r.id !== id) })),

  // ------------------------------------------------------------ stock moves
  invAdjustStock: ({ locationId, productId, delta, reason, note = '' }) => {
    get().adjustStock(locationId, productId, Number(delta), `Adjustment – ${reason}`, note)
    get().audit('Stock adjustment', 'Stock', `${productId} ${delta > 0 ? '+' : ''}${delta} @ ${locationId}`)
  },
  invTransfer: ({ fromLoc, toType, toId, productId, qty, note = '' }) => {
    const s = get()
    const q = Number(qty)
    if (toType === 'LOCATION') get().transferStock(fromLoc, toId, productId, q, 'Inter-location transfer', note)
    else {
      const p = s.partners.find((x) => x.id === toId)
      get().adjustStock(fromLoc, productId, -q, `Stock transfer to ${p?.name}`, note)
      get().adjustPartnerStock(toId, productId, q)
      const pr = s.products.find((x) => x.id === productId)
      get().notify({ title: 'Stock transferred to your store', body: `${q} x ${pr?.shortName}${note ? ` – ${note}` : ''}`, partnerId: toId, link: p?.type === 'FRANCHISE' ? '/franchise/stock' : '/dealer/stock' })
    }
    get().audit('Stock transfer', 'Stock', `${productId} x${q} ${fromLoc} → ${toId}`)
  },
})
