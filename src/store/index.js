// Central store (zustand + localStorage persistence).
// Core cross-module actions live here; module-specific actions live in ./slices/<module>.js.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSeed } from './seed'
import { addDays, nowISO, round2, sum, today, uid, makeAttachment, fmtINR } from '../lib/format'
import { priceOrder } from '../lib/pricing'
import { resolveTerms } from '../lib/warranty'
import { MAIN_WH } from '../lib/stock'
import { purchaseSlice } from './slices/purchase'
import { salesSlice } from './slices/sales'
import { dispatchSlice } from './slices/dispatch'
import { accountsSlice } from './slices/accounts'
import { hrSlice } from './slices/hr'
import { serviceSlice } from './slices/service'
import { portalsSlice } from './slices/portals'
import { aiSlice } from './slices/ai'
import { adminSlice } from './slices/admin'
import { procurementSlice } from './slices/procurement'
import { vendorSlice } from './slices/vendor'

export const SERIES_FORMAT = {
  PO: (n) => `PO/26-27/${String(n).padStart(4, '0')}`,
  SO: (n) => `SO/26-27/${String(n).padStart(4, '0')}`,
  INV: (n) => `BT/26-27/${String(n).padStart(4, '0')}`,
  QT: (n) => `QT/26-27/${String(n).padStart(4, '0')}`,
  SH: (n) => `SH/26-27/${String(n).padStart(4, '0')}`,
  RFQ: (n) => `RFQ/26-27/${String(n).padStart(4, '0')}`,
  EXP: (n) => `EXP/26-27/${String(n).padStart(4, '0')}`,
  GRN: (n) => `GRN/26-27/${String(n).padStart(4, '0')}`,
  TKT: (n) => `TKT-${String(n).padStart(5, '0')}`,
  WCL: (n) => `WCL-${String(n).padStart(4, '0')}`,
  RET: (n) => `RET/26-27/${String(n).padStart(4, '0')}`,
  VB: (n) => `VB/26-27/${String(n).padStart(4, '0')}`,
  EXPN: (n) => `EXPN-${String(n).padStart(4, '0')}`,
  JV: (n) => `JV/26-27/${String(n).padStart(4, '0')}`,
  CN: (n) => `CN/26-27/${String(n).padStart(4, '0')}`,
  DN: (n) => `DN/26-27/${String(n).padStart(4, '0')}`,
  POS: (n) => `POS-${String(n).padStart(5, '0')}`,
  REP: (n) => `REP/26-27/${String(n).padStart(4, '0')}`,
  CP: (n) => `CP/26-27/${String(n).padStart(4, '0')}`,
  PAY: (n) => `PAY/26-27/${String(n).padStart(4, '0')}`,
  RCPT: (n) => `RCPT/${String(n).padStart(4, '0')}`,
  CLM: (n) => `CLM-${String(n).padStart(4, '0')}`,
  PR: (n) => `PR/26-27/${String(n).padStart(3, '0')}`,
}

const coreSlice = (set, get) => ({
  session: { userId: null },

  // ------------------------------------------------------------ session / admin
  login: (userId) => set({ session: { userId } }),
  logout: () => set({ session: { userId: null } }),
  currentUser: () => get().users.find((u) => u.id === get().session.userId) || null,
  resetDemo: () => {
    const fresh = createSeed()
    set({ ...fresh, session: get().session })
  },

  // ------------------------------------------------------------ generic CRUD
  addItem: (col, item) => {
    const it = { id: item.id || uid(col.slice(0, 3)), ...item }
    set((s) => ({ [col]: [it, ...(s[col] || [])] }))
    return it
  },
  updateItem: (col, id, patch) => {
    let updated = null
    set((s) => ({
      [col]: (s[col] || []).map((x) => {
        if (x.id !== id) return x
        updated = typeof patch === 'function' ? patch(x) : { ...x, ...patch }
        return updated
      }),
    }))
    return updated
  },
  removeItem: (col, id) => set((s) => ({ [col]: (s[col] || []).filter((x) => x.id !== id) })),
  getItem: (col, id) => (get()[col] || []).find((x) => x.id === id),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...(typeof patch === 'function' ? patch(s.settings) : patch) } })),

  /** next formatted document number, e.g. nextNo('PO') -> 'PO/26-27/0113' */
  nextNo: (key) => {
    const n = (get().settings.series[key] || 0) + 1
    set((s) => ({ settings: { ...s.settings, series: { ...s.settings.series, [key]: n } } }))
    return (SERIES_FORMAT[key] || ((x) => `${key}-${x}`))(n)
  },

  // ------------------------------------------------------------ notifications / email / audit
  notify: ({ title, body = '', type = 'info', link = '', roles = [], userIds = [], partnerId = null, vendorId = null }) => {
    const n = { id: uid('n'), ts: nowISO(), title, body, type, link, roles, userIds, partnerId, vendorId, read: false }
    set((s) => ({ notifications: [n, ...s.notifications].slice(0, 300) }))
    return n
  },
  markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
  markAllNotificationsRead: (ids) => set((s) => ({ notifications: s.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) })),
  sendEmail: ({ to, cc = '', subject, body = '', attachments = [], ref = '', kind = 'EMAIL' }) => {
    const e = { id: uid('em'), ts: nowISO(), to, cc, subject, body, attachments, ref, kind, status: 'SENT', by: get().session.userId }
    set((s) => ({ emails: [e, ...s.emails].slice(0, 500) }))
    return e
  },
  audit: (action, entity = '', ref = '') => {
    const a = { id: uid('au'), ts: nowISO(), userId: get().session.userId, action, entity, ref }
    set((s) => ({ auditLog: [a, ...s.auditLog].slice(0, 1000) }))
  },

  // ------------------------------------------------------------ stock + units
  adjustStock: (locationId, productId, delta, reason = '', ref = '') => {
    set((s) => {
      const loc = { ...(s.stock[locationId] || {}) }
      loc[productId] = Math.max(0, (loc[productId] || 0) + delta)
      const move = { id: uid('mv'), ts: nowISO(), date: today(), locationId, productId, qty: delta, reason, ref, userId: s.session.userId }
      return { stock: { ...s.stock, [locationId]: loc }, stockMoves: [move, ...s.stockMoves].slice(0, 2000) }
    })
  },
  transferStock: (fromLoc, toLoc, productId, qty, reason = 'Transfer', ref = '') => {
    get().adjustStock(fromLoc, productId, -qty, reason, ref)
    get().adjustStock(toLoc, productId, qty, reason, ref)
  },
  adjustPartnerStock: (partnerId, productId, delta) =>
    set((s) => ({
      partners: s.partners.map((p) => (p.id === partnerId ? { ...p, stock: { ...(p.stock || {}), [productId]: Math.max(0, ((p.stock || {})[productId] || 0) + delta) }, stockUpdatedAt: today() } : p)),
    })),
  updateUnits: (codes, patch, event, ref = '') => {
    const set_ = new Set(codes)
    set((s) => ({
      units: s.units.map((u) => (set_.has(u.code) ? { ...u, ...(typeof patch === 'function' ? patch(u) : patch), history: event ? [...u.history, { ts: nowISO(), event, ref }] : u.history } : u)),
    }))
  },
  /** create barcodes for a PO: one per FG unit, one per carton for spares */
  generateBarcodes: (poId) => {
    const s = get()
    const po = s.purchaseOrders.find((p) => p.id === poId)
    if (!po) return []
    if (s.units.some((u) => u.poId === poId)) return s.units.filter((u) => u.poId === poId)
    const series = JSON.parse(JSON.stringify(s.settings.barcodeSeries))
    const created = []
    for (const l of po.lines) {
      const p = s.products.find((x) => x.id === l.productId)
      const cfg = series[p.category]
      const n = p.type === 'SPARE' ? Math.ceil(l.qty / (p.cartonQty || 1)) : l.qty
      for (let i = 0; i < n; i++) {
        const code = `${cfg.prefix}${String(cfg.next++).padStart(6, '0')}`
        created.push({ code, productId: p.id, poId, vendorId: po.vendorId, status: 'GENERATED', locationId: 'VENDOR', partnerId: null, invoiceId: null, packQty: p.type === 'SPARE' ? p.cartonQty : 1, history: [{ ts: nowISO(), event: 'Barcode generated', ref: po.number }] })
      }
    }
    set((st) => ({
      units: [...st.units, ...created],
      settings: { ...st.settings, barcodeSeries: series },
      purchaseOrders: st.purchaseOrders.map((x) => (x.id === poId ? { ...x, barcodesGenerated: true, barcodesAt: nowISO(), timeline: [...(x.timeline || []), { ts: nowISO(), text: `${created.length} barcodes generated` }] } : x)),
    }))
    get().audit('Generated barcodes', 'PO', po.number)
    return created
  },

  // ------------------------------------------------------------ purchase core
  createPO: (data) => {
    const number = get().nextNo('PO')
    const vendor = get().vendors.find((v) => v.id === data.vendorId)
    const po = {
      id: uid('po'), number, type: data.type || 'IMPORT', vendorId: data.vendorId, date: today(), status: data.draft ? 'DRAFT' : 'PENDING_APPROVAL',
      currency: vendor?.currency || 'USD', lines: data.lines, paymentTerms: data.paymentTerms || vendor?.paymentTerms, note: data.note || '',
      source: data.source || 'MANUAL', createdBy: get().session.userId, requiresCustomerPayment: !!data.requiresCustomerPayment, linkedSoId: data.linkedSoId || null, customerPaid: false,
      qc: [], improvements: [], deliverySchedule: [], docs: [], mrpConfirmed: false, labelsSent: false, barcodesGenerated: false, stickerConfirmed: false,
      exportOrderId: data.exportOrderId || null,
      timeline: [{ ts: nowISO(), text: data.draft ? 'Draft created' : 'Created and sent for approval' }],
    }
    set((s) => ({ purchaseOrders: [po, ...s.purchaseOrders] }))
    if (!data.draft) get().notify({ title: 'PO awaiting approval', body: `${number} · ${vendor?.name}`, link: `/erp/purchase/orders/${po.id}`, roles: ['ADMIN'] })
    get().audit('Created PO', 'PO', number)
    return po
  },
  approvePO: (id, ok = true, remark = '') => {
    const po = get().purchaseOrders.find((p) => p.id === id)
    const vendor = get().vendors.find((v) => v.id === po.vendorId)
    get().updateItem('purchaseOrders', id, (x) => ({ ...x, status: ok ? 'APPROVED' : 'REJECTED', approvedBy: get().session.userId, approvedAt: nowISO(), timeline: [...x.timeline, { ts: nowISO(), text: ok ? `Approved${remark ? ` – ${remark}` : ''}; sent to vendor` : `Rejected – ${remark}` }] }))
    if (ok) {
      get().sendEmail({ to: vendor.email, subject: `Purchase Order ${po.number} – Btali International`, body: `Dear ${vendor.contact},\n\nPlease find attached PO ${po.number}. Kindly upload your Proforma Invoice on the Btali Vendor Portal.\n\nRegards,\nBtali Purchase`, attachments: [makeAttachment(`${po.number.replace(/\//g, '-')}.pdf`)], ref: po.number })
      get().notify({ title: 'New Purchase Order', body: `${po.number} has been issued. Please upload your PI.`, link: `/vendor/orders/${po.id}`, vendorId: po.vendorId, roles: [] })
    }
    get().notify({ title: ok ? 'PO approved' : 'PO rejected', body: po.number, link: `/erp/purchase/orders/${id}`, roles: ['PURCHASE'] })
    get().audit(ok ? 'Approved PO' : 'Rejected PO', 'PO', po.number)
  },
  uploadPI: (poId, { number, amount, file }) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, status: 'PI_RECEIVED', pi: { number, amount, file, uploadedAt: nowISO(), status: 'PENDING' }, docs: [...x.docs, { ...file, docType: 'PI' }], timeline: [...x.timeline, { ts: nowISO(), text: `Vendor uploaded PI ${number}` }] }))
    get().notify({ title: 'PI uploaded by vendor', body: `${po.number} · PI ${number}`, link: `/erp/purchase/orders/${poId}`, roles: ['PURCHASE', 'ADMIN'] })
  },
  approvePI: (poId, ok = true, remark = '') => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    const stamped = makeAttachment(`PI-${po.pi?.number || po.number}-STAMPED.pdf`, { docType: 'PI_STAMPED' })
    get().updateItem('purchaseOrders', poId, (x) => ({
      ...x,
      status: ok ? 'IN_PRODUCTION' : 'APPROVED',
      pi: { ...x.pi, status: ok ? 'APPROVED' : 'REJECTED', approvedAt: nowISO(), approvedBy: get().session.userId, stampedFile: ok ? stamped : null, remark },
      docs: ok ? [...x.docs, stamped] : x.docs,
      timeline: [...x.timeline, { ts: nowISO(), text: ok ? 'PI digitally approved – stamped copy shared with vendor' : `PI rejected – ${remark}` }],
    }))
    get().notify({ title: ok ? 'PI approved' : 'PI rejected', body: `${po.number}${remark ? ` – ${remark}` : ''}`, link: `/vendor/orders/${poId}`, vendorId: po.vendorId })
    get().audit(ok ? 'Approved PI' : 'Rejected PI', 'PO', po.number)
  },
  /** Starex / purchase inward against a shipment. lines: [{productId, expected, received}] */
  receiveShipment: (shipmentId, { lines, qcMedia = [], remarks = '' }) => {
    const s = get()
    const sh = s.shipments.find((x) => x.id === shipmentId)
    const grnNo = get().nextNo('GRN')
    const discrepancies = []
    for (const l of lines) {
      if (l.received > 0) get().adjustStock(MAIN_WH, l.productId, l.received, 'GRN inward', grnNo)
      if (l.received !== l.expected) discrepancies.push({ productId: l.productId, expected: l.expected, received: l.received, type: l.received < l.expected ? 'SHORT' : 'EXCESS', note: remarks, settled: false })
    }
    const codes = s.units.filter((u) => sh.poIds.includes(u.poId) && ['IN_TRANSIT', 'PACKED', 'GENERATED'].includes(u.status)).map((u) => u.code)
    get().updateUnits(codes, { status: 'IN_WAREHOUSE', locationId: MAIN_WH }, 'Inward scanned at Starex', grnNo)
    get().updateItem('shipments', shipmentId, (x) => ({
      ...x, status: 'RECEIVED', ata: x.ata || today(),
      milestones: x.milestones.map((m) => (m.done ? m : { ...m, done: true, date: today() })),
      inward: { grnNo, date: today(), receivedBy: s.session.userId, discrepancies, qcMedia, remarks, lines },
    }))
    set((st) => ({ purchaseOrders: st.purchaseOrders.map((p) => (sh.poIds.includes(p.id) ? { ...p, status: 'RECEIVED', receivedAt: today(), timeline: [...p.timeline, { ts: nowISO(), text: `Received at Starex – ${grnNo}` }] } : p)) }))
    if (discrepancies.length) {
      get().createTicket({ source: 'STAREX', category: discrepancies.some((d) => d.type === 'SHORT') ? 'SHORTAGE' : 'GENERAL', subject: `Inward discrepancy on ${sh.number} (${grnNo})`, description: discrepancies.map((d) => `${s.products.find((p) => p.id === d.productId)?.sku}: expected ${d.expected}, received ${d.received}`).join('\n'), orderRef: sh.number, priority: 'HIGH' })
    }
    get().notify({ title: 'Container received at Starex', body: `${sh.number} · ${grnNo}${discrepancies.length ? ` · ${discrepancies.length} discrepancies` : ''}`, link: `/erp/purchase/inward`, roles: ['PURCHASE', 'SALES_MANAGER', 'SALES_EXEC', 'DISPATCH', 'ADMIN', 'ACCOUNTS'] })
    get().audit('Inward GRN', 'Shipment', grnNo)
    return { grnNo, discrepancies }
  },
  /** allocate import charges to products and update landed cost (weighted with existing stock) */
  computeLandedAllocation: (shipmentId, costs, method = 'VALUE') => {
    const s = get()
    const sh = s.shipments.find((x) => x.id === shipmentId)
    const pos = s.purchaseOrders.filter((p) => sh.poIds.includes(p.id))
    const fx = s.settings.fx
    const lines = pos.flatMap((po) => po.lines.map((l) => {
      const p = s.products.find((x) => x.id === l.productId)
      const valueINR = l.qty * l.rate * (fx[po.currency] || 1)
      return { productId: l.productId, qty: l.qty, valueINR, weight: l.qty * p.weightKg, cbm: l.qty * p.cbm }
    }))
    const basisKey = method === 'WEIGHT' ? 'weight' : method === 'VOLUME' ? 'cbm' : 'valueINR'
    const totalBasis = sum(lines, (l) => l[basisKey]) || 1
    const charges = (Number(costs.freightINR) || 0) + (Number(costs.insurance) || 0) + (Number(costs.duty) || 0) + (Number(costs.cha) || 0) + (Number(costs.portTransport) || 0) + (Number(costs.other) || 0)
    // IGST is input-tax credit – tracked but not added to cost
    return lines.map((l) => {
      const share = l[basisKey] / totalBasis
      const alloc = charges * share
      const unitLanded = (l.valueINR + alloc) / l.qty
      return { ...l, share: round2(share * 100), allocated: round2(alloc), unitLanded: round2(unitLanded), igst: round2((Number(costs.igst) || 0) * share) }
    })
  },
  finalizeLandedCost: (shipmentId, costs, method = 'VALUE') => {
    const alloc = get().computeLandedAllocation(shipmentId, costs, method)
    const s = get()
    const sh = s.shipments.find((x) => x.id === shipmentId)
    set((st) => ({
      products: st.products.map((p) => {
        const a = alloc.find((x) => x.productId === p.id)
        if (!a) return p
        const existing = st.stock[MAIN_WH]?.[p.id] || 0
        const newCost = Math.round((existing * p.landedCost + a.qty * a.unitLanded) / (existing + a.qty))
        return { ...p, landedCost: newCost, lastLandedCost: Math.round(a.unitLanded), landedHistory: [...(p.landedHistory || []), { date: today(), shipment: sh.number, unit: Math.round(a.unitLanded), weighted: newCost }] }
      }),
      shipments: st.shipments.map((x) => (x.id === shipmentId ? { ...x, landedCost: { ...costs, method, finalized: true, finalizedAt: nowISO(), allocation: alloc } } : x)),
    }))
    get().notify({ title: 'Landed cost finalised', body: `${sh.number} – price lists can be refreshed`, link: '/erp/purchase/price-lists', roles: ['PURCHASE', 'SALES_MANAGER', 'ADMIN', 'ACCOUNTS'] })
    get().audit('Finalised landed cost', 'Shipment', sh.number)
    return alloc
  },

  // ------------------------------------------------------------ sales core
  priceOrder: (partnerId, lines) => priceOrder(get(), partnerId, lines),
  createSalesOrder: ({ partnerId, lines, source = 'SALES', note = '', warehouseId = MAIN_WH, salespersonId, transporterId, quotationId }) => {
    const s = get()
    const partner = s.partners.find((p) => p.id === partnerId)
    const priced = priceOrder(s, partnerId, lines)
    const number = get().nextNo('SO')
    const status = source === 'PORTAL' ? 'PENDING_REVIEW' : 'CONFIRMED'
    const so = {
      id: uid('so'), number, partnerId, date: today(), source, salespersonId: salespersonId || partner?.salespersonId, lines: priced.lines, subtotal: priced.subtotal, gst: priced.gst, total: priced.total,
      appliedSchemes: priced.appliedSchemes, status, paymentStatus: 'UNPAID', paidAmount: 0, warehouseId, transporterId: transporterId || partner?.transporterId, note, quotationId: quotationId || null,
      timeline: [{ ts: nowISO(), text: source === 'PORTAL' ? 'Placed via Dealer Portal – awaiting Sales review' : 'Order created & confirmed' }],
    }
    set((st) => ({ salesOrders: [so, ...st.salesOrders] }))
    if (status === 'CONFIRMED') get().sendOrderConfirmation(so.id)
    else get().notify({ title: 'New portal order to review', body: `${number} · ${partner?.name} · ${fmtINR(so.total)}`, link: `/erp/sales/orders/${so.id}`, roles: ['SALES_MANAGER', 'SALES_EXEC', 'ADMIN'] })
    get().audit('Created SO', 'SO', number)
    return so
  },
  sendOrderConfirmation: (soId) => {
    const s = get()
    const so = s.salesOrders.find((x) => x.id === soId)
    const p = s.partners.find((x) => x.id === so.partnerId)
    get().sendEmail({ to: p.email, subject: `Order ${so.number} confirmed – Btali International`, body: `Dear ${p.contact},\n\nYour order ${so.number} for ${fmtINR(so.total)} is confirmed. Please remit the advance to proceed with invoicing.\n\nRegards,\nBtali Sales`, attachments: [makeAttachment(`${so.number.replace(/\//g, '-')}.pdf`)], ref: so.number })
    get().notify({ title: 'Order confirmed', body: `${so.number} · ${fmtINR(so.total)} – please remit advance`, link: `/dealer/orders`, partnerId: so.partnerId })
    get().notify({ title: 'Awaiting advance payment', body: `${so.number} · ${p.name}`, link: '/erp/accounts/receipts', roles: ['ACCOUNTS'] })
  },
  approvePortalOrder: (id, ok = true, remark = '') => {
    const so = get().salesOrders.find((x) => x.id === id)
    get().updateItem('salesOrders', id, (x) => ({ ...x, status: ok ? 'CONFIRMED' : 'CANCELLED', reviewedBy: get().session.userId, timeline: [...x.timeline, { ts: nowISO(), text: ok ? `Reviewed & confirmed by Sales${remark ? ` – ${remark}` : ''}` : `Rejected – ${remark}` }] }))
    if (ok) get().sendOrderConfirmation(id)
    else get().notify({ title: 'Order not accepted', body: `${so.number}: ${remark}`, partnerId: so.partnerId, link: '/dealer/orders' })
    get().audit(ok ? 'Confirmed portal order' : 'Rejected portal order', 'SO', so.number)
  },
  cancelSalesOrder: (id, reason = '') => {
    const so = get().salesOrders.find((x) => x.id === id)
    get().updateItem('salesOrders', id, (x) => ({ ...x, status: 'CANCELLED', timeline: [...x.timeline, { ts: nowISO(), text: `Cancelled – ${reason}` }] }))
    get().audit('Cancelled SO', 'SO', so.number)
  },
  /** Accounts marks advance received. Full payment -> PAID (ready to invoice). */
  recordReceipt: ({ soId, amount, mode = 'NEFT', ref = '', date = today(), bankId = 'bk1' }) => {
    const s = get()
    const so = s.salesOrders.find((x) => x.id === soId)
    const number = get().nextNo('RCPT')
    const rc = { id: uid('rc'), number, partnerId: so.partnerId, soId, amount: Number(amount), mode, ref, date, bankId, recordedBy: s.session.userId }
    const paid = round2((so.paidAmount || 0) + Number(amount))
    const full = paid >= so.total - 1
    set((st) => ({
      receipts: [rc, ...st.receipts],
      salesOrders: st.salesOrders.map((x) => (x.id === soId ? { ...x, paidAmount: paid, paymentStatus: full ? 'PAID' : 'PARTIAL', status: full && x.status === 'CONFIRMED' ? 'PAID' : x.status, timeline: [...x.timeline, { ts: nowISO(), text: `Payment ${fmtINR(amount)} received (${mode} ${ref})${full ? ' – fully paid, ready for invoice' : ''}` }] } : x)),
      purchaseOrders: st.purchaseOrders.map((p) => (p.linkedSoId === soId && full ? { ...p, customerPaid: true, timeline: [...p.timeline, { ts: nowISO(), text: 'Customer payment received – vendor dispatch unlocked' }] } : p)),
    }))
    if (full) {
      get().notify({ title: 'Ready to invoice', body: `${so.number} fully paid`, link: '/erp/dispatch/invoices', roles: ['DISPATCH'] })
      get().notify({ title: 'Payment received', body: `${so.number} – ${fmtINR(amount)}`, link: `/erp/sales/orders/${soId}`, roles: ['SALES_EXEC', 'SALES_MANAGER'] })
      get().notify({ title: 'Payment received', body: `${so.number} – we are preparing your invoice`, link: '/dealer/orders', partnerId: so.partnerId })
    }
    get().audit('Recorded receipt', 'Receipt', number)
    return rc
  },
  /** Dispatch creates invoice. Blocks if stock insufficient. */
  createInvoice: (soId, { transporterId, vehicleNo = '', locationId } = {}) => {
    const s = get()
    const so = s.salesOrders.find((x) => x.id === soId)
    if (!so) return { ok: false, error: 'Order not found' }
    if (so.paymentStatus !== 'PAID') return { ok: false, error: 'Advance payment not received for this order.' }
    if (so.invoiceId) return { ok: false, error: 'Invoice already created.' }
    const loc = locationId || so.warehouseId || MAIN_WH
    const shortages = so.lines
      .map((l) => ({ productId: l.productId, need: l.qty, have: s.stock[loc]?.[l.productId] || 0 }))
      .filter((x) => x.need > x.have)
    if (shortages.length) return { ok: false, error: 'Insufficient stock – invoice cannot be processed.', shortages }
    const number = get().nextNo('INV')
    const partner = s.partners.find((p) => p.id === so.partnerId)
    const tr = s.transporters.find((t) => t.id === (transporterId || so.transporterId))
    // allocate barcoded units FIFO
    const units = []
    for (const l of so.lines) {
      const avail = s.units.filter((u) => u.productId === l.productId && u.status === 'IN_WAREHOUSE' && u.locationId === loc).slice(0, l.qty)
      units.push(...avail.map((u) => u.code))
    }
    const inv = {
      id: uid('inv'), number, soId, partnerId: so.partnerId, date: today(), lines: so.lines, subtotal: so.subtotal, gst: so.gst, total: so.total,
      transporterId: tr?.id, vehicleNo: vehicleNo || tr?.vehicleNo || '', status: 'ISSUED', lr: null, sentToStarex: true, emailed: true,
      irn: `IRN${Date.now().toString().slice(-10)}`, ewayBill: String(Date.now()).slice(-12), type: 'TAX', dispatchDate: addDays(today(), 1), units, locationId: loc, safex: !!tr?.isSafex,
    }
    for (const l of so.lines) get().adjustStock(loc, l.productId, -l.qty, 'Sales invoice', number)
    get().updateUnits(units, { status: 'INVOICED', invoiceId: inv.id }, `Invoiced on ${number}`, number)
    set((st) => ({
      invoices: [inv, ...st.invoices],
      salesOrders: st.salesOrders.map((x) => (x.id === soId ? { ...x, status: 'INVOICED', invoiceId: inv.id, transporterId: inv.transporterId, timeline: [...x.timeline, { ts: nowISO(), text: `Invoice ${number} generated · emailed to client · pushed to Starex schedule` }] } : x)),
    }))
    get().sendEmail({ to: partner.email, subject: `Invoice ${number} – Btali International`, body: `Dear ${partner.contact},\n\nPlease find attached invoice ${number} for ${fmtINR(inv.total)}. Goods will be dispatched via ${tr?.name || 'transporter'}.\n\nRegards,\nBtali Dispatch`, attachments: [makeAttachment(`${number.replace(/\//g, '-')}.pdf`)], ref: number })
    get().sendEmail({ to: 'ops@starex3pl.in', subject: `Dispatch request ${number}`, body: `Please prepare ${so.lines.length} line(s) for ${partner.name} via ${tr?.name}.`, ref: number, kind: 'STAREX_PUSH' })
    if (tr?.isSafex) get().raiseSafexDebitNote?.(inv.id)
    get().notify({ title: 'Invoice generated', body: `${number} for your order ${so.number}`, link: '/dealer/documents', partnerId: so.partnerId })
    get().notify({ title: 'New dispatch in schedule', body: `${number} · ${partner.name} · ${tr?.name}`, link: '/starex/schedule', roles: ['STAREX'] })
    get().audit('Created invoice', 'Invoice', number)
    return { ok: true, invoice: inv }
  },
  /** LR upload (Dispatch or Starex). Marks dispatched, emails client, moves units to partner. */
  uploadLR: (invoiceId, { lrNo, date = today(), file = null, vehicleNo = '' }) => {
    const s = get()
    const inv = s.invoices.find((x) => x.id === invoiceId)
    const partner = s.partners.find((p) => p.id === inv.partnerId)
    const lr = { number: lrNo, date, file: file || makeAttachment(`LR-${lrNo}.pdf`), uploadedBy: s.session.userId, uploadedAt: nowISO(), vehicleNo }
    set((st) => ({
      invoices: st.invoices.map((x) => (x.id === invoiceId ? { ...x, status: 'DISPATCHED', lr, dispatchDate: date, vehicleNo: vehicleNo || x.vehicleNo } : x)),
      salesOrders: st.salesOrders.map((x) => (x.id === inv.soId ? { ...x, status: 'DISPATCHED', timeline: [...(x.timeline || []), { ts: nowISO(), text: `Dispatched – LR ${lrNo} uploaded & emailed to client` }] } : x)),
    }))
    get().updateUnits(inv.units || [], { status: 'AT_PARTNER', partnerId: inv.partnerId, locationId: inv.partnerId }, `Dispatched to ${partner.name}`, inv.number)
    if (partner.type === 'FRANCHISE' || Object.keys(partner.stock || {}).length) for (const l of inv.lines) get().adjustPartnerStock(partner.id, l.productId, l.qty)
    get().sendEmail({ to: partner.email, subject: `Dispatched: ${inv.number} – LR ${lrNo}`, body: `Dear ${partner.contact},\n\nGoods against invoice ${inv.number} have been dispatched. LR No. ${lrNo} attached.\n\nRegards,\nBtali Dispatch`, attachments: [lr.file], ref: inv.number })
    get().notify({ title: 'Goods dispatched', body: `${inv.number} · LR ${lrNo}`, link: '/dealer/orders', partnerId: inv.partnerId })
    get().notify({ title: 'LR uploaded', body: `${inv.number} · ${partner.name} · LR ${lrNo}`, link: `/erp/dispatch/lr`, roles: ['SALES_EXEC', 'SALES_MANAGER', 'DISPATCH'] })
    get().audit('Uploaded LR', 'Invoice', inv.number)
  },

  // ------------------------------------------------------------ dealer onboarding
  submitDealerOnboarding: (data) => {
    const p = { id: uid('d'), code: `DLR-${200 + get().partners.length}`, type: 'DEALER', stage: 'IN_DECISION', status: 'PENDING_APPROVAL', stock: {}, kyc: [], authorizedCategories: [], extraDiscountPct: 0, paymentTerms: 'Advance', creditDays: 0, portalAccess: false, submittedAt: nowISO(), submittedBy: get().session.userId, ...data }
    set((s) => ({ partners: [p, ...s.partners] }))
    get().notify({ title: 'Dealer onboarding for approval', body: `${p.name}, ${p.city}`, link: '/erp/sales/onboarding', roles: ['SALES_MANAGER', 'ADMIN'] })
    return p
  },
  approveDealer: (id, ok = true, remark = '') => {
    const p = get().partners.find((x) => x.id === id)
    get().updateItem('partners', id, (x) => ({ ...x, status: ok ? 'ACTIVE' : 'REJECTED', stage: ok ? 'CURRENT' : 'IN_DECISION', onboardedAt: ok ? today() : null, portalAccess: ok, approvedBy: get().session.userId, approvalRemark: remark }))
    if (ok) get().sendEmail({ to: p.email, subject: 'Welcome to Btali – Dealer Portal access', body: `Dear ${p.contact},\n\nYour dealership has been approved. Login to the Btali Dealer Portal to view prices and place orders.\n\nRegards,\nBtali Sales`, ref: p.code })
    get().audit(ok ? 'Approved dealer' : 'Rejected dealer', 'Partner', p.name)
  },

  // ------------------------------------------------------------ tickets (unified)
  createTicket: (data) => {
    const number = get().nextNo('TKT')
    const t = { id: uid('tk'), number, priority: 'MEDIUM', stage: 'LOGGED', assigneeId: null, slaHours: data.priority === 'HIGH' ? 48 : 72, createdAt: nowISO(), updates: [], attachments: [], createdBy: get().session.userId, ...data }
    set((s) => ({ tickets: [t, ...s.tickets] }))
    get().notify({ title: `New ticket ${number}`, body: t.subject, link: `/erp/service/tickets`, roles: ['SERVICE', 'ADMIN', ...(t.category === 'SHORTAGE' || t.category === 'VENDOR_ISSUE' ? ['PURCHASE'] : []), ...(t.category === 'DAMAGE_IN_TRANSIT' ? ['DISPATCH'] : [])] })
    return t
  },
  updateTicket: (id, { note, stage, assigneeId, ...rest } = {}) => {
    const by = get().session.userId
    const t = get().tickets.find((x) => x.id === id)
    get().updateItem('tickets', id, (x) => ({
      ...x, ...rest,
      stage: stage || x.stage,
      assigneeId: assigneeId !== undefined ? assigneeId : x.assigneeId,
      resolvedAt: stage === 'RESOLVED' || stage === 'CLOSED' ? nowISO() : x.resolvedAt,
      updates: [...x.updates, { ts: nowISO(), by, text: note || (stage ? `Stage → ${stage.replace(/_/g, ' ')}` : assigneeId ? 'Re-assigned' : 'Updated'), stage }],
    }))
    if (stage === 'CLOSED' || stage === 'RESOLVED') {
      if (t.partnerId) get().notify({ title: `Ticket ${t.number} ${stage.toLowerCase()}`, body: t.subject, partnerId: t.partnerId, link: '/dealer/support' })
      if (t.vendorId) get().notify({ title: `Ticket ${t.number} ${stage.toLowerCase()}`, body: t.subject, vendorId: t.vendorId, link: '/vendor/tickets' })
    }
  },
  escalateTicketToVendor: (id, vendorId, note = '') => {
    const t = get().tickets.find((x) => x.id === id)
    get().updateTicket(id, { escalatedToVendor: true, vendorId, note: `Escalated to vendor. ${note}`, stage: 'IN_PROGRESS' })
    get().notify({ title: 'Service escalation from Btali', body: `${t.number}: ${t.subject}`, vendorId, link: '/vendor/tickets' })
  },

  // ------------------------------------------------------------ warranty
  registerWarranty: ({ barcode, customer, partnerId, saleDate = today(), source = 'DEALER_PORTAL', invoiceRef = '' }) => {
    const s = get()
    const code = String(barcode || '').trim().toUpperCase()
    const unit = s.units.find((u) => u.code.toUpperCase() === code)
    if (!unit) return { ok: false, error: 'Barcode not found in Btali records.' }
    if (s.warranties.some((w) => w.barcode === unit.code)) return { ok: false, error: 'Warranty already registered for this barcode.' }
    const product = s.products.find((p) => p.id === unit.productId)
    const terms = resolveTerms(s, product, { vendorId: unit.vendorId, partnerId })
    const w = {
      id: uid('w'), number: `WAR-${5001 + s.warranties.length}`, barcode: unit.code, productId: unit.productId, partnerId, customer, saleDate, startDate: saleDate,
      endDate: addDays(saleDate, Math.round(terms.months * 30.4)), months: terms.months, partnerMonths: terms.partnerMonths, vendorMonths: terms.vendorMonths, source, invoiceRef, status: 'ACTIVE', createdAt: nowISO(),
    }
    set((st) => ({ warranties: [w, ...st.warranties] }))
    get().updateUnits([unit.code], { status: 'SOLD', saleDate, partnerId: partnerId || unit.partnerId }, 'Sold to end customer (warranty activated)', w.number)
    return { ok: true, warranty: w }
  },
  createWarrantyClaim: ({ barcode, issue, requestType = 'REPAIR', partnerId, attachments = [] }) => {
    const s = get()
    const w = s.warranties.find((x) => x.barcode.toUpperCase() === String(barcode).toUpperCase())
    if (!w) return { ok: false, error: 'No registered warranty for this barcode.' }
    const number = get().nextNo('WCL')
    const claim = { id: uid('wc'), number, warrantyId: w.id, barcode: w.barcode, productId: w.productId, partnerId: partnerId || w.partnerId, issue, requestType, status: 'SUBMITTED', bearer: null, cost: 0, attachments, createdAt: nowISO(), timeline: [{ ts: nowISO(), text: 'Claim submitted' }] }
    const t = get().createTicket({ source: partnerId?.startsWith('f') ? 'FRANCHISE' : 'DEALER', category: 'WARRANTY_CLAIM', subject: `${number}: ${issue}`, partnerId: claim.partnerId, productId: w.productId, barcode: w.barcode, claimId: claim.id })
    claim.ticketId = t.id
    set((st) => ({ warrantyClaims: [claim, ...st.warrantyClaims] }))
    return { ok: true, claim }
  },
  decideWarrantyClaim: (id, ok = true, remark = '') => {
    const c = get().warrantyClaims.find((x) => x.id === id)
    get().updateItem('warrantyClaims', id, (x) => ({ ...x, status: ok ? 'APPROVED' : 'REJECTED', decidedBy: get().session.userId, remark, timeline: [...x.timeline, { ts: nowISO(), text: ok ? `Approved – ${x.requestType.toLowerCase()} authorised${remark ? ` (${remark})` : ''}` : `Rejected – ${remark}` }] }))
    if (c.ticketId) get().updateTicket(c.ticketId, { stage: ok ? 'IN_PROGRESS' : 'CLOSED', note: ok ? 'Warranty claim approved' : `Warranty claim rejected: ${remark}` })
    get().notify({ title: `Warranty claim ${ok ? 'approved' : 'rejected'}`, body: `${c.number}${remark ? ` – ${remark}` : ''}`, partnerId: c.partnerId, link: '/dealer/warranty' })
  },

  // ------------------------------------------------------------ POS (franchise / dealer)
  posCheckout: ({ partnerId, sessionId, lines, payments, customer, registerWarranty = true }) => {
    const number = get().nextNo('POS')
    const total = round2(sum(lines, (l) => l.qty * l.price))
    const order = { id: uid('pos'), number, partnerId, sessionId, date: today(), ts: nowISO(), lines, total, payments, customer, warrantyIds: [], synced: true }
    for (const l of lines) get().adjustPartnerStock(partnerId, l.productId, -l.qty)
    const codes = lines.map((l) => l.barcode).filter(Boolean)
    if (codes.length) get().updateUnits(codes, { status: 'SOLD', saleDate: today() }, 'Sold at POS', number)
    if (registerWarranty && customer?.name) {
      for (const c of codes) {
        const r = get().registerWarranty({ barcode: c, customer, partnerId, source: 'POS', invoiceRef: number })
        if (r.ok) order.warrantyIds.push(r.warranty.id)
      }
    }
    set((s) => ({ posOrders: [order, ...(s.posOrders || [])] }))
    get().audit('POS sale', 'POS', number)
    return order
  },
})

export const useStore = create(
  persist(
    (set, get, api) => ({
      ...createSeed(),
      ...coreSlice(set, get, api),
      ...purchaseSlice(set, get, api),
      ...salesSlice(set, get, api),
      ...dispatchSlice(set, get, api),
      ...accountsSlice(set, get, api),
      ...hrSlice(set, get, api),
      ...serviceSlice(set, get, api),
      ...portalsSlice(set, get, api),
      ...aiSlice(set, get, api),
      ...adminSlice(set, get, api),
      ...procurementSlice(set, get, api),
      ...vendorSlice(set, get, api),
    }),
    {
      name: 'btali-erp-demo',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/** Current logged-in user (reactive) */
export const useUser = () => {
  const id = useStore((s) => s.session.userId)
  const users = useStore((s) => s.users)
  return users.find((u) => u.id === id) || null
}

/** Lookup helpers */
export const useLookup = () => {
  const products = useStore((s) => s.products)
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const users = useStore((s) => s.users)
  const transporters = useStore((s) => s.transporters)
  return {
    product: (id) => products.find((x) => x.id === id),
    partner: (id) => partners.find((x) => x.id === id),
    vendor: (id) => vendors.find((x) => x.id === id),
    user: (id) => users.find((x) => x.id === id),
    transporter: (id) => transporters.find((x) => x.id === id),
  }
}
