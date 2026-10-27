// Store actions for the "vendor" module: vendor-side PO collaboration, scan-to-pack, escalation responses, profile.
import { nowISO, uid, round2, makeAttachment, fmtDate } from '../../lib/format'

const purchaseEmail = 'purchase@btali.in'

const poPatch = (get, poId, fn, text) =>
  get().updateItem('purchaseOrders', poId, (x) => {
    const n = fn(x)
    return { ...n, timeline: text ? [...(x.timeline || []), { ts: nowISO(), text }] : n.timeline || x.timeline }
  })

/** Packing list lines computed from scanned (PACKED) units of a PO. */
export const packingSummary = (state, poId) => {
  const po = state.purchaseOrders.find((p) => p.id === poId)
  if (!po) return { lines: [], totals: {} }
  const units = state.units.filter((u) => u.poId === poId)
  const lines = po.lines.map((l) => {
    const p = state.products.find((x) => x.id === l.productId)
    const mine = units.filter((u) => u.productId === l.productId)
    const packedUnits = mine.filter((u) => u.status !== 'GENERATED')
    const isSpare = p?.type === 'SPARE'
    const qty = isSpare ? packedUnits.reduce((a, u) => a + (u.packQty || p.cartonQty || 1), 0) : packedUnits.length
    const cartons = isSpare ? packedUnits.length : packedUnits.length
    return {
      productId: l.productId, ordered: l.qty, barcodes: mine.length, packedBarcodes: packedUnits.length, qty: Math.min(qty, isSpare ? qty : qty),
      cartons, cbm: round2(qty * (p?.cbm || 0)), weight: round2(qty * (p?.weightKg || 0)),
    }
  })
  const totals = {
    ordered: lines.reduce((a, l) => a + l.ordered, 0), qty: lines.reduce((a, l) => a + l.qty, 0), cartons: lines.reduce((a, l) => a + l.cartons, 0),
    cbm: round2(lines.reduce((a, l) => a + l.cbm, 0)), weight: round2(lines.reduce((a, l) => a + l.weight, 0)),
    barcodes: lines.reduce((a, l) => a + l.barcodes, 0), packed: lines.reduce((a, l) => a + l.packedBarcodes, 0),
  }
  return { lines, totals }
}

export const vendorSlice = (set, get) => ({
  vndConfirmStickers: (poId, { note = '', photos = [] } = {}) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    poPatch(get, poId, (x) => ({ ...x, stickerConfirmed: true, stickerConfirmedAt: nowISO(), stickerNote: note, docs: [...(x.docs || []), ...photos.map((f) => ({ ...f, docType: 'STICKER_PROOF' }))] }), `Vendor confirmed MRP sticker & barcode printing and application${note ? ` – ${note}` : ''}`)
    get().notify({ title: 'Stickers & barcodes applied', body: `${po.number} – vendor confirmed printing & application`, link: `/erp/purchase/orders/${poId}`, roles: ['PURCHASE'] })
    get().audit('Confirmed stickers', 'PO', po.number)
  },

  vndRequestBarcodes: (poId) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    poPatch(get, poId, (x) => ({ ...x, barcodeRequestedAt: nowISO() }), 'Vendor requested barcode sheet')
    get().notify({ title: 'Vendor requests barcodes', body: `${po.number} – please generate & share barcode stickers`, link: `/erp/purchase/orders/${poId}`, roles: ['PURCHASE'] })
  },

  vndAddDeliverySchedule: (poId, { date, qty, note = '' }) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    poPatch(get, poId, (x) => ({ ...x, deliverySchedule: [...(x.deliverySchedule || []), { id: uid('ds'), date, qty: Number(qty), note, declaredAt: nowISO() }] }), `Delivery schedule declared: ${qty} pcs ready by ${fmtDate(date)}`)
    get().notify({ title: 'Delivery schedule declared', body: `${po.number}: ${qty} pcs by ${fmtDate(date)}`, link: `/erp/purchase/orders/${poId}`, roles: ['PURCHASE'] })
  },
  vndRemoveDeliverySchedule: (poId, id) => poPatch(get, poId, (x) => ({ ...x, deliverySchedule: (x.deliverySchedule || []).filter((d) => d.id !== id) }), 'Delivery schedule line withdrawn'),

  /** items: [{file, caption}] – kind derived from file type */
  vndUploadQC: (poId, items) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    const qc = items.map((it) => ({ id: uid('qc'), kind: it.file.type?.startsWith('video') || /\.(mp4|mov)$/i.test(it.file.name) ? 'video' : 'photo', file: it.file, caption: it.caption || it.file.name, status: 'PENDING', remark: '', uploadedAt: nowISO() }))
    poPatch(get, poId, (x) => ({ ...x, qc: [...(x.qc || []), ...qc], status: ['IN_PRODUCTION', 'READY_TO_SHIP', 'QC_PENDING'].includes(x.status) ? 'QC_PENDING' : x.status }), `Vendor uploaded ${qc.length} QC file(s)`)
    get().notify({ title: 'QC media awaiting review', body: `${po.number}: ${qc.length} new file(s)`, link: '/erp/purchase/qc', roles: ['PURCHASE', 'ADMIN'] })
    get().sendEmail({ to: purchaseEmail, subject: `QC uploaded – ${po.number}`, body: `${qc.length} QC photo/video file(s) uploaded on the Vendor Portal for ${po.number}. Please review and approve.`, ref: po.number })
    get().audit('Uploaded QC', 'PO', po.number)
  },

  vndDeclareImprovement: (poId, { text, attachments = [] }) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    poPatch(get, poId, (x) => ({ ...x, improvements: [...(x.improvements || []), { id: uid('im'), text, date: new Date().toISOString().slice(0, 10), ack: false, attachments }] }), `Product improvement declared: ${text}`)
    get().notify({ title: 'Product improvement declared', body: `${po.number}: ${text}`, link: `/erp/purchase/orders/${poId}`, roles: ['PURCHASE'] })
  },

  /** Scan a barcode while loading. Returns {ok, error, unit} */
  vndPackUnit: (poId, code) => {
    const s = get()
    const c = String(code || '').trim().toUpperCase()
    const u = s.units.find((x) => x.code.toUpperCase() === c)
    if (!u) return { ok: false, error: `${c} is not a Btali barcode` }
    if (u.poId !== poId) return { ok: false, error: `${c} belongs to a different order` }
    if (u.status !== 'GENERATED') return { ok: false, error: `${c} already scanned (${u.status.toLowerCase().replace(/_/g, ' ')})`, duplicate: true }
    get().updateUnits([u.code], { status: 'PACKED' }, 'Packed & scanned at factory', s.vendors.find((v) => v.id === u.vendorId)?.name || '')
    return { ok: true, unit: u }
  },
  vndUnpackUnit: (code) => get().updateUnits([code], { status: 'GENERATED' }, 'Removed from packing (re-scan required)', ''),

  vndGeneratePackingList: (poId) => {
    const s = get()
    const po = s.purchaseOrders.find((p) => p.id === poId)
    const { lines } = packingSummary(s, poId)
    const scanned = s.units.filter((u) => u.poId === poId && u.status === 'PACKED').map((u) => u.code)
    const file = makeAttachment(`PL-${po.number.replace(/\//g, '-')}.xlsx`, { docType: 'PL' })
    const packingList = { source: 'BARCODE_SCAN', generatedAt: nowISO(), lines: lines.filter((l) => l.qty > 0).map(({ productId, qty, cartons, cbm, weight }) => ({ productId, qty, cartons, cbm, weight })), scanned, file }
    poPatch(get, poId, (x) => ({ ...x, packingList, docs: [...(x.docs || []).filter((d) => d.docType !== 'PL'), file] }), `Final packing list generated from ${scanned.length} barcode scans`)
    get().notify({ title: 'Packing list generated (barcode scan)', body: `${po.number}: ${scanned.length} scans`, link: `/erp/purchase/orders/${poId}`, roles: ['PURCHASE'] })
    get().sendEmail({ to: purchaseEmail, subject: `Final packing list – ${po.number}`, body: `The vendor has generated the final packing list for ${po.number} from ${scanned.length} barcode scans.`, attachments: [file], ref: po.number })
    get().audit('Generated packing list', 'PO', po.number)
    return packingList
  },

  vndUploadCommercialInvoice: (poId, { number, amount, file }) => {
    const po = get().purchaseOrders.find((p) => p.id === poId)
    const f = { ...file, docType: 'CI', ciNumber: number, amount: Number(amount) || 0 }
    poPatch(get, poId, (x) => ({ ...x, commercialInvoice: f, docs: [...(x.docs || []), f] }), `Commercial invoice ${number} uploaded`)
    get().notify({ title: 'Commercial invoice uploaded', body: `${po.number}: CI ${number}`, link: `/erp/purchase/orders/${poId}`, roles: ['PURCHASE', 'ACCOUNTS'] })
    get().audit('Uploaded CI', 'PO', po.number)
  },

  /** docType: TELEX | COO | BL | OTHER */
  vndUploadFinanceDoc: (poId, { docType = 'TELEX', file, note = '' }) => {
    const s = get()
    const po = s.purchaseOrders.find((p) => p.id === poId)
    const f = { ...file, docType, note }
    poPatch(get, poId, (x) => ({ ...x, docs: [...(x.docs || []), f], ...(docType === 'TELEX' ? { telexUploadedAt: nowISO() } : {}) }), `${docType === 'TELEX' ? 'Telex release' : docType} uploaded by vendor`)
    set((st) => ({ vendorDocs: [{ id: uid('vd'), vendorId: po.vendorId, poId, docType, title: docType === 'TELEX' ? `Telex release – ${po.number}` : `${docType} – ${po.number}`, file: f, date: new Date().toISOString().slice(0, 10), uploadedBy: st.session.userId, direction: 'FROM_VENDOR' }, ...(st.vendorDocs || [])] }))
    if (docType === 'TELEX' && po.shipmentId) {
      get().updateItem('shipments', po.shipmentId, (x) => ({ ...x, telexReleased: true, milestones: (x.milestones || []).map((m) => (m.key === 'TELEX' ? { ...m, done: true, date: new Date().toISOString().slice(0, 10) } : m)) }))
    }
    get().notify({ title: docType === 'TELEX' ? 'Telex release received' : 'Vendor document uploaded', body: `${po.number}`, link: `/erp/purchase/orders/${poId}`, roles: ['PURCHASE', 'ACCOUNTS', 'SALES_MANAGER'] })
    get().audit(`Uploaded ${docType}`, 'PO', po.number)
  },

  vndRaiseTicket: ({ vendorId, subject, description, orderRef, productId, priority = 'MEDIUM', category = 'VENDOR_ISSUE', attachments = [] }) => {
    const t = get().createTicket({ source: 'VENDOR', category, subject, description, vendorId, orderRef, productId, priority, attachments })
    get().audit('Vendor raised ticket', 'Ticket', t.number)
    return t
  },

  /** Vendor's resolution on a Btali escalation. kind 'TICKET' | 'CLAIM' */
  vndRespondToEscalation: (kind, id, { type, text, docs = [] }) => {
    const s = get()
    const by = s.session.userId
    const resp = { type, text, docs, ts: nowISO(), by }
    let ref = ''
    if (kind === 'CLAIM') {
      const c = s.warrantyClaims.find((x) => x.id === id)
      ref = c.number
      get().updateItem('warrantyClaims', id, (x) => ({ ...x, vendorClaim: { ...x.vendorClaim, status: 'RESPONDED', response: `${type.replace(/_/g, ' ').toLowerCase()}: ${text}`, responseType: type, respondedAt: nowISO(), docs: [...(x.vendorClaim?.docs || []), ...docs] }, timeline: [...x.timeline, { ts: nowISO(), text: `Vendor responded – ${type.replace(/_/g, ' ').toLowerCase()}: ${text}` }] }))
    } else {
      const t = s.tickets.find((x) => x.id === id)
      ref = t.number
      get().updateItem('tickets', id, (x) => ({ ...x, vendorResponse: resp, vendorStatus: 'RESPONDED', vendorRespondedAt: x.vendorRespondedAt || nowISO(), attachments: [...(x.attachments || []), ...docs], updates: [...x.updates, { ts: nowISO(), by, text: `Vendor response (${type.replace(/_/g, ' ').toLowerCase()}): ${text}`, attachments: docs }] }))
    }
    get().notify({ title: 'Vendor responded to escalation', body: `${ref}: ${type.replace(/_/g, ' ').toLowerCase()}`, link: kind === 'CLAIM' ? '/erp/service/claims' : `/erp/service/tickets?id=${id}`, roles: ['SERVICE', 'PURCHASE'] })
    get().sendEmail({ to: 'service@btali.in', subject: `Vendor response on ${ref}`, body: `${type.replace(/_/g, ' ')}\n\n${text}`, attachments: docs, ref })
    get().audit('Vendor responded', kind, ref)
  },

  vndUpdateProfile: (vendorId, { vendor = {}, profile = {} }) => {
    get().updateItem('vendors', vendorId, vendor)
    set((s) => {
      const list = s.vendorProfiles || []
      const exists = list.some((p) => p.vendorId === vendorId)
      return { vendorProfiles: exists ? list.map((p) => (p.vendorId === vendorId ? { ...p, ...profile, updatedAt: nowISO() } : p)) : [{ id: uid('vp'), vendorId, ...profile, updatedAt: nowISO() }, ...list] }
    })
    get().notify({ title: 'Vendor profile updated', body: get().vendors.find((v) => v.id === vendorId)?.name, link: '/erp/masters/vendors', roles: ['PURCHASE'] })
    get().audit('Updated vendor profile', 'Vendor', vendorId)
  },
})
