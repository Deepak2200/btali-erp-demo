// Store actions for the "purchase" module. (set, get, api) come from zustand; see src/store/index.js for core helpers.
import { nowISO, today, addDays, uid, makeAttachment, round2, sum, daysBetween } from '../../lib/format'
import { SHIPMENT_MILESTONES } from '../seed/core'
import { MAIN_WH } from '../../lib/stock'

const tl = (x, text) => [...(x.timeline || []), { ts: nowISO(), text }]
const safe = (n = '') => n.replace(/\//g, '-')
const PLAN_SPECS = { '20FT': { cbm: 33, kg: 21700 }, '40FT': { cbm: 67, kg: 26500 }, '40HC': { cbm: 76, kg: 26500 } }

const deriveShipmentStatus = (sh) => {
  if (sh.status === 'RECEIVED') return 'RECEIVED'
  const done = new Set(sh.milestones.filter((m) => m.done).map((m) => m.key))
  if (done.has('CLEARED')) return 'CLEARED'
  if (done.has('ARRIVED')) return 'AT_PORT'
  if (done.has('ETD')) return 'IN_TRANSIT'
  return 'BOOKED'
}

export const purchaseSlice = (set, get) => ({
  // ------------------------------------------------------------ PO lifecycle helpers
  submitPOForApproval: (id) => {
    const po = get().purchaseOrders.find((p) => p.id === id)
    const vendor = get().vendors.find((v) => v.id === po.vendorId)
    get().updateItem('purchaseOrders', id, (x) => ({ ...x, status: 'PENDING_APPROVAL', timeline: tl(x, 'Submitted for Director approval') }))
    get().notify({ title: 'PO awaiting approval', body: `${po.number} · ${vendor?.name}`, link: `/erp/purchase/orders/${id}`, roles: ['ADMIN'] })
    get().audit('Submitted PO', 'PO', po.number)
  },
  cancelPO: (id, reason = '') => {
    const po = get().purchaseOrders.find((p) => p.id === id)
    get().updateItem('purchaseOrders', id, (x) => ({ ...x, status: 'CANCELLED', cancelReason: reason, timeline: tl(x, `Cancelled – ${reason}`) }))
    if (!['DRAFT', 'PENDING_APPROVAL'].includes(po.status)) get().notify({ title: 'PO cancelled by Btali', body: `${po.number}: ${reason}`, vendorId: po.vendorId, link: `/vendor/orders/${id}` })
    get().audit('Cancelled PO', 'PO', po.number)
  },
  addPODocs: (poId, atts, docType = 'OTHER') => {
    const by = get().session.userId
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, docs: [...(x.docs || []), ...atts.map((a) => ({ ...a, docType: a.docType || docType, uploadedBy: by }))], timeline: tl(x, `${atts.length} document(s) added (${docType.replace(/_/g, ' ')})`) }))
  },
  addDeliverySchedule: (poId, { date, qty, note }) => {
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, deliverySchedule: [...(x.deliverySchedule || []), { id: uid('ds'), date, qty: Number(qty), note, by: 'BTALI' }], timeline: tl(x, `Delivery slot added for ${date}`) }))
  },
  sendPIToAccounts: (poId) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    const files = (po.docs || []).filter((d) => ['PI', 'PI_STAMPED', 'CI', 'PL'].includes(d.docType))
    get().sendEmail({ to: 'accounts@btali.in', subject: `Payment schedule – ${po.number}`, body: `Please schedule vendor payments for ${po.number} as per agreed terms. Stamped PI attached.`, attachments: files, ref: po.number })
    get().notify({ title: 'Vendor payment schedule shared', body: po.number, link: `/erp/purchase/orders/${poId}`, roles: ['ACCOUNTS', 'FINANCE_HEAD'] })
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, sentToAccountsAt: nowISO(), timeline: tl(x, 'Payment schedule & PI forwarded to Accounts') }))
  },

  // ------------------------------------------------------------ MRP & labels
  confirmMrp: (poId, mrps) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    const by = get().session.userId
    const n = Object.keys(mrps).length
    set((st) => ({
      products: st.products.map((p) => (mrps[p.id] != null ? { ...p, mrp: Number(mrps[p.id]), mrpHistory: [...(p.mrpHistory || []), { date: today(), from: p.mrp, mrp: Number(mrps[p.id]), ref: po.number, by }] } : p)),
      purchaseOrders: st.purchaseOrders.map((x) => (x.id === poId ? { ...x, lines: x.lines.map((l) => (mrps[l.productId] != null ? { ...l, mrp: Number(mrps[l.productId]) } : l)), mrpConfirmed: true, mrpConfirmedAt: nowISO(), mrpConfirmedBy: by, timeline: tl(x, `MRP confirmed for ${n} item(s); product master updated`) } : x)),
    }))
    get().notify({ title: 'MRP confirmed', body: `${po.number} – ${n} item(s); price lists may need refresh`, link: '/erp/purchase/price-lists', roles: ['SALES_MANAGER', 'ADMIN'] })
    get().audit('Confirmed MRP', 'PO', po.number)
  },
  sendLabelsToVendor: (poId) => {
    const s = get()
    const po = s.purchaseOrders.find((p) => p.id === poId)
    const vendor = s.vendors.find((v) => v.id === po.vendorId)
    const file = makeAttachment(`MRP-Labels-${safe(po.number)}.pdf`, { docType: 'MRP_LABEL', uploadedBy: s.session.userId })
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, labelsSent: true, labelsSentAt: nowISO(), docs: [...(x.docs || []), file], timeline: tl(x, 'MRP label artwork published to Vendor Portal') }))
    get().sendEmail({ to: vendor.email, subject: `MRP label artwork – ${po.number}`, body: `Dear ${vendor.contact},\n\nThe approved Btali MRP labels for ${po.number} are available on the Vendor Portal. Please confirm printing & application before QC.\n\nRegards,\nBtali Purchase`, attachments: [file], ref: po.number })
    get().notify({ title: 'MRP labels available', body: `${po.number} – please confirm printing`, link: `/vendor/orders/${poId}`, vendorId: po.vendorId })
    get().audit('Sent labels to vendor', 'PO', po.number)
  },
  sendBarcodesToVendor: (poId) => {
    const s = get()
    const po = s.purchaseOrders.find((p) => p.id === poId)
    const vendor = s.vendors.find((v) => v.id === po.vendorId)
    const n = s.units.filter((u) => u.poId === poId).length
    const file = makeAttachment(`Barcode-Stickers-${safe(po.number)}.pdf`, { docType: 'BARCODE', uploadedBy: s.session.userId })
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, barcodesSent: true, barcodesSentAt: nowISO(), docs: [...(x.docs || []), file], timeline: tl(x, `${n} barcode stickers uploaded to Vendor Portal`) }))
    get().sendEmail({ to: vendor.email, subject: `Barcode stickers – ${po.number}`, body: `Dear ${vendor.contact},\n\n${n} Btali barcode stickers for ${po.number} are on the Vendor Portal. Please print, stick one per unit (one per carton for spares) and scan each at loading to generate the packing list.\n\nRegards,\nBtali Purchase`, attachments: [file], ref: po.number })
    get().notify({ title: 'Barcode stickers ready', body: `${po.number} – ${n} stickers to print`, link: `/vendor/orders/${poId}`, vendorId: po.vendorId })
    get().audit('Uploaded barcodes to vendor', 'PO', po.number)
  },

  // ------------------------------------------------------------ QC
  reviewQCItem: (poId, qcId, ok, remark = '') => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    const item = po.qc.find((q) => q.id === qcId)
    get().updateItem('purchaseOrders', poId, (x) => ({
      ...x,
      qcRejectedOnce: x.qcRejectedOnce || !ok,
      qc: x.qc.map((q) => (q.id === qcId ? { ...q, status: ok ? 'APPROVED' : 'REJECTED', remark, reviewedAt: nowISO(), reviewedBy: get().session.userId } : q)),
      timeline: tl(x, `QC ${ok ? 'approved' : 'rejected'}: ${item?.caption || item?.file?.name}${remark ? ` – ${remark}` : ''}`),
    }))
    if (!ok) get().notify({ title: 'QC item rejected', body: `${po.number}: ${item?.caption || ''} – ${remark}`, type: 'warning', link: `/vendor/orders/${poId}`, vendorId: po.vendorId })
  },
  releaseQC: (poId, remark = '') => {
    const s = get()
    const po = s.purchaseOrders.find((p) => p.id === poId)
    const vendor = s.vendors.find((v) => v.id === po.vendorId)
    get().updateItem('purchaseOrders', poId, (x) => ({
      ...x,
      status: ['IN_PRODUCTION', 'QC_PENDING', 'PI_RECEIVED', 'APPROVED'].includes(x.status) ? 'READY_TO_SHIP' : x.status,
      qc: x.qc.map((q) => (q.status === 'PENDING' ? { ...q, status: 'APPROVED', reviewedAt: nowISO(), reviewedBy: s.session.userId } : q)),
      qcApprovedAt: nowISO(),
      qcApprovedBy: s.session.userId,
      timeline: tl(x, `QC approved & released for shipment${remark ? ` – ${remark}` : ''}`),
    }))
    get().sendEmail({ to: vendor.email, subject: `QC approved – ${po.number} released for shipment`, body: `Dear ${vendor.contact},\n\nQC for ${po.number} is approved. Please proceed with stuffing, scan barcodes at loading and upload the packing list & commercial invoice.\n\nRegards,\nBtali Purchase`, ref: po.number })
    get().notify({ title: 'QC approved – ready to ship', body: po.number, link: `/vendor/orders/${poId}`, vendorId: po.vendorId })
    get().notify({ title: 'PO ready to ship', body: `${po.number} · plan container & book freight`, link: '/erp/purchase/container-planning', roles: ['PURCHASE'] })
    get().audit('Released QC', 'PO', po.number)
  },
  addQCMedia: (poId, atts, caption = '') => {
    const by = get().session.userId
    get().updateItem('purchaseOrders', poId, (x) => ({
      ...x,
      status: x.status === 'IN_PRODUCTION' ? 'QC_PENDING' : x.status,
      qc: [...(x.qc || []), ...atts.map((a) => ({ id: uid('qc'), kind: a.type?.startsWith('video') ? 'video' : 'photo', file: a, caption: caption || a.name, status: 'PENDING', uploadedAt: nowISO(), source: 'BTALI', uploadedBy: by }))],
      timeline: tl(x, `${atts.length} internal QC file(s) uploaded by Btali`),
    }))
  },
  ackImprovement: (poId, impId, note = '') => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, improvements: x.improvements.map((i) => (i.id === impId ? { ...i, ack: true, ackAt: nowISO(), ackBy: get().session.userId, ackNote: note } : i)), timeline: tl(x, 'Vendor improvement acknowledged') }))
    get().notify({ title: 'Improvement acknowledged', body: `${po.number}${note ? ` – ${note}` : ''}`, link: `/vendor/orders/${poId}`, vendorId: po.vendorId })
  },

  // ------------------------------------------------------------ packing list / domestic flow
  sendPackingListToStarex: (poId, lines) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    const file = makeAttachment(`Packing-List-${safe(po.number)}.xlsx`, { docType: 'PL' })
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, packingList: { ...(x.packingList || {}), lines: x.packingList?.lines?.length ? x.packingList.lines : lines, generatedAt: x.packingList?.generatedAt || nowISO(), source: x.packingList?.source || 'ERP', sentToStarexAt: nowISO() }, docs: [...(x.docs || []), file], timeline: tl(x, 'Packing list shared with Starex warehouse') }))
    get().sendEmail({ to: 'ops@starex3pl.in', subject: `Expected inward – ${po.number}`, body: `Packing list for ${po.number} attached (${lines.length} lines, ${sum(lines, (l) => l.cartons)} cartons).`, attachments: [file], ref: po.number, kind: 'STAREX_PUSH' })
    get().notify({ title: 'Expected inward', body: `${po.number} packing list shared`, link: '/starex/inward', roles: ['STAREX'] })
  },
  requestCustomerPayment: (poId) => {
    const s = get()
    const po = s.purchaseOrders.find((p) => p.id === poId)
    const so = s.salesOrders.find((x) => x.id === po.linkedSoId)
    get().notify({ title: 'Customer payment pending – vendor dispatch on hold', body: `${so?.number || ''} linked to ${po.number}`, type: 'warning', link: '/erp/accounts/receipts', roles: ['ACCOUNTS', 'SALES_MANAGER', 'SALES_EXEC'] })
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, timeline: tl(x, 'Reminder sent to Accounts & Sales for customer payment') }))
  },
  confirmVendorDispatch: (poId, { lrNo, date = today(), vehicleNo = '', note = '' }) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    if (po.requiresCustomerPayment && !po.customerPaid) return { ok: false, error: 'Customer payment not yet received.' }
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, status: ['APPROVED', 'PI_RECEIVED', 'IN_PRODUCTION', 'READY_TO_SHIP'].includes(x.status) ? 'SHIPPED' : x.status, vendorDispatch: { lrNo, date, vehicleNo, note, confirmedAt: nowISO(), by: get().session.userId }, timeline: tl(x, `Vendor dispatch confirmed – LR ${lrNo}`) }))
    get().notify({ title: 'Domestic dispatch confirmed', body: `${po.number} · LR ${lrNo}`, link: `/erp/purchase/orders/${poId}`, roles: ['STAREX', 'SALES_MANAGER', 'DISPATCH'] })
    get().audit('Confirmed vendor dispatch', 'PO', po.number)
    return { ok: true }
  },
  receiveDomesticPO: (poId, received = null) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    const grnNo = get().nextNo('GRN')
    for (const l of po.lines) {
      const q = received?.[l.productId] ?? l.qty
      if (q > 0) get().adjustStock(MAIN_WH, l.productId, q, 'Domestic PO inward', grnNo)
    }
    get().updateItem('purchaseOrders', poId, (x) => ({ ...x, status: 'RECEIVED', receivedAt: today(), grnNo, timeline: tl(x, `Goods received at Starex – ${grnNo}; stock updated`) }))
    get().notify({ title: 'Domestic goods received', body: `${po.number} · ${grnNo}`, link: `/erp/purchase/orders/${poId}`, roles: ['PURCHASE', 'SALES_MANAGER', 'DISPATCH', 'ACCOUNTS'] })
    get().audit('Received domestic PO', 'PO', po.number)
    return grnNo
  },

  // ------------------------------------------------------------ shipments
  createShipment: ({ poIds, containerNo, containerType = '40HC', blNo = '', forwarderId, indianForwarderId, chaId, etd, eta, freightRate = 0, freightCurrency = 'USD', planId = null }) => {
    const s = get()
    const number = get().nextNo('SH')
    const pos = s.purchaseOrders.filter((p) => poIds.includes(p.id))
    const plan = [addDays(etd, -3), etd, addDays(eta, -3), addDays(eta, -2), eta, addDays(eta, 1), addDays(eta, 3), addDays(eta, 3), addDays(eta, 4), addDays(eta, 5)]
    const etdDone = etd <= today()
    const sh = {
      id: uid('sh'), number, poIds, vendorId: pos[0]?.vendorId, forwarderId, indianForwarderId, chaId, containerNo, containerType, blNo, etd, eta, originalEta: eta, ata: null,
      status: etdDone ? 'IN_TRANSIT' : 'BOOKED', telexReleased: false, planId,
      milestones: SHIPMENT_MILESTONES.map((m, i) => ({ ...m, planned: plan[i], date: i === 0 || (i === 1 && etdDone) ? plan[i] : null, done: i === 0 || (i === 1 && etdDone) })),
      freight: { rate: Number(freightRate) || 0, currency: freightCurrency },
      landedCost: { finalized: false, method: s.settings.landedCostMethod || 'VALUE', freightINR: Math.round((Number(freightRate) || 0) * (s.settings.fx[freightCurrency] || 1)), insurance: 0, duty: 0, igst: 0, cha: 0, portTransport: 0, other: 0 },
      inward: null, alerts: [], etaHistory: [], createdAt: nowISO(), createdBy: s.session.userId,
    }
    set((st) => ({
      shipments: [sh, ...st.shipments],
      purchaseOrders: st.purchaseOrders.map((p) => (poIds.includes(p.id) ? { ...p, status: 'SHIPPED', shipmentId: sh.id, timeline: tl(p, `Shipped in ${containerNo} (${number}) – ETA ${eta}`) } : p)),
      containerPlans: planId ? (st.containerPlans || []).map((c) => (c.id === planId ? { ...c, shipmentIds: [...(c.shipmentIds || []), sh.id] } : c)) : st.containerPlans,
    }))
    const codes = s.units.filter((u) => poIds.includes(u.poId) && ['GENERATED', 'PACKED'].includes(u.status)).map((u) => u.code)
    if (codes.length) get().updateUnits(codes, { status: 'IN_TRANSIT', locationId: 'WH-TRANSIT' }, `Shipped in container ${containerNo}`, number)
    const body = `${number} · ${containerNo} (${containerType}) · ${pos.map((p) => p.number).join(', ')} · ETA ${eta}`
    get().notify({ title: 'New container booked', body, link: '/erp/purchase/shipments', roles: ['SALES_MANAGER', 'SALES_EXEC', 'DISPATCH', 'ACCOUNTS', 'STAREX', 'ADMIN'] })
    get().sendEmail({ to: 'ops@starex3pl.in', cc: 'accounts@btali.in', subject: `Container advance notice – ${containerNo}`, body: `Container ${containerNo} (${containerType}) under ${number} is expected at Nhava Sheva on ${eta}. POs: ${pos.map((p) => p.number).join(', ')}.`, ref: number, kind: 'STAREX_PUSH' })
    for (const p of pos) get().notify({ title: 'Shipment booked', body: `${p.number} · ${containerNo} · BL ${blNo || 'to follow'}`, vendorId: p.vendorId, link: `/vendor/orders/${p.id}` })
    get().audit('Created shipment', 'Shipment', number)
    return sh
  },
  updateShipmentMilestone: (shId, key, { done = true, date = today() } = {}) => {
    const sh0 = get().shipments.find((x) => x.id === shId)
    const m0 = sh0.milestones.find((m) => m.key === key)
    get().updateItem('shipments', shId, (x) => {
      const milestones = x.milestones.map((m) => (m.key === key ? { ...m, done, date: done ? date : null } : m))
      const next = { ...x, milestones, telexReleased: key === 'TELEX' ? done : x.telexReleased, ata: key === 'ARRIVED' ? (done ? date : null) : x.ata }
      return { ...next, status: deriveShipmentStatus(next), log: [...(x.log || []), { ts: nowISO(), text: `${m0.label} ${done ? `marked done (${date})` : 'reopened'}`, by: get().session.userId }] }
    })
    if (done && ['ARRIVED', 'CLEARED', 'PORT_TO_WH'].includes(key)) get().notify({ title: `${sh0.containerNo}: ${m0.label}`, body: sh0.number, link: '/erp/purchase/shipments', roles: ['PURCHASE', 'SALES_MANAGER', 'SALES_EXEC', 'DISPATCH', 'ACCOUNTS', 'STAREX'] })
  },
  changeShipmentEta: (shId, eta, reason = '') => {
    const sh = get().shipments.find((x) => x.id === shId)
    const delta = daysBetween(sh.eta, eta)
    get().updateItem('shipments', shId, (x) => ({
      ...x, eta, originalEta: x.originalEta || x.eta,
      milestones: x.milestones.map((m, i) => (m.done || i < 2 ? m : { ...m, planned: addDays(m.planned, delta) })),
      etaHistory: [...(x.etaHistory || []), { ts: nowISO(), from: x.eta, to: eta, reason, by: get().session.userId }],
      log: [...(x.log || []), { ts: nowISO(), text: `ETA changed ${x.eta} → ${eta}: ${reason}`, by: get().session.userId }],
    }))
    get().notify({ title: `ETA ${delta > 0 ? 'delayed' : 'advanced'}: ${sh.containerNo}`, body: `${sh.number} now ${eta} (${delta > 0 ? '+' : ''}${delta}d) – ${reason}`, type: delta > 0 ? 'warning' : 'info', link: '/erp/purchase/shipments', roles: ['SALES_MANAGER', 'SALES_EXEC', 'DISPATCH', 'ACCOUNTS', 'STAREX', 'ADMIN'] })
    get().audit('Changed ETA', 'Shipment', sh.number)
  },
  setTelexRelease: (shId, val) => {
    const sh = get().shipments.find((x) => x.id === shId)
    get().updateShipmentMilestone(shId, 'TELEX', { done: val, date: today() })
    if (val) {
      get().notify({ title: 'Telex release received', body: `${sh.number} · ${sh.containerNo} – forwarder can release container`, link: '/erp/purchase/shipments', roles: ['PURCHASE', 'ACCOUNTS', 'SALES_MANAGER', 'ADMIN'] })
      get().sendEmail({ to: get().vendors.find((v) => v.id === sh.indianForwarderId)?.email || 'ops@gaflogistics.in', subject: `Telex release – BL ${sh.blNo}`, body: `Telex release received for BL ${sh.blNo} (${sh.containerNo}). Please proceed with delivery order.`, ref: sh.number })
    }
  },

  // ------------------------------------------------------------ container planning
  saveContainerPlan: (plan) => {
    const spec = PLAN_SPECS[plan.containerType] || PLAN_SPECS['40HC']
    const count = Math.max(1, plan.containerCount || 1)
    const cbm = sum(plan.items, (i) => i.cbm)
    const kg = sum(plan.items, (i) => i.weight)
    const base = {
      ...plan, capacityCbm: spec.cbm, maxWeightKg: spec.kg, containerCount: count,
      totalCbm: round2(cbm), totalWeight: round2(kg),
      utilizationPct: round2((cbm / (spec.cbm * count)) * 100), weightPct: round2((kg / (spec.kg * count)) * 100),
      poIds: [...new Set(plan.items.map((i) => i.poId))],
    }
    const exists = plan.id && (get().containerPlans || []).some((c) => c.id === plan.id)
    if (exists) {
      get().updateItem('containerPlans', plan.id, (x) => ({ ...x, ...base, status: x.status === 'REJECTED' ? 'DRAFT' : x.status, history: [...(x.history || []), { ts: nowISO(), text: 'Plan updated', by: get().session.userId }] }))
      return get().containerPlans.find((c) => c.id === plan.id)
    }
    const it = { ...base, id: uid('cp'), number: get().nextNo('CP'), status: 'DRAFT', createdBy: get().session.userId, createdAt: nowISO(), history: [{ ts: nowISO(), text: 'Draft saved', by: get().session.userId }] }
    set((st) => ({ containerPlans: [it, ...(st.containerPlans || [])] }))
    get().audit('Saved container plan', 'ContainerPlan', it.number)
    return it
  },
  submitContainerPlan: (id) => {
    const p = get().containerPlans.find((c) => c.id === id)
    get().updateItem('containerPlans', id, (x) => ({ ...x, status: 'PENDING_APPROVAL', submittedAt: nowISO(), history: [...(x.history || []), { ts: nowISO(), text: 'Submitted for Director approval', by: get().session.userId }] }))
    get().notify({ title: 'Container plan awaiting approval', body: `${p.number} · ${p.containerCount} × ${p.containerType} · ${p.utilizationPct}% utilised`, link: '/erp/purchase/container-planning', roles: ['ADMIN'] })
  },
  approveContainerPlan: (id, approved = true, remark = '') => {
    const p = (get().containerPlans || []).find((c) => c.id === id)
    if (!p) return
    get().updateItem('containerPlans', id, (x) => ({ ...x, status: approved ? 'APPROVED' : 'REJECTED', approvedBy: get().session.userId, approvedAt: nowISO(), approvalRemark: remark, history: [...(x.history || []), { ts: nowISO(), text: approved ? `Approved${remark ? ` – ${remark}` : ''}` : `Rejected – ${remark}`, by: get().session.userId }] }))
    get().notify({ title: approved ? 'Container plan approved' : 'Container plan rejected', body: `${p.number}${remark ? ` – ${remark}` : ''}`, type: approved ? 'info' : 'warning', link: '/erp/purchase/container-planning', roles: ['PURCHASE'] })
    get().audit(approved ? 'Approved container plan' : 'Rejected container plan', 'ContainerPlan', p.number)
  },
  deleteContainerPlan: (id) => {
    const p = get().containerPlans.find((c) => c.id === id)
    get().removeItem('containerPlans', id)
    get().audit('Deleted container plan', 'ContainerPlan', p?.number)
  },
})
