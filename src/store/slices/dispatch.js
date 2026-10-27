// Store actions for the Dispatch module + Starex Warehouse Portal.
// Pure helpers (freight estimate, MIS matching, Safex charge) are exported so seeds and screens share one engine.
import { nowISO, today, round2, sum, uid, makeAttachment, fmtINR, addDays } from '../../lib/format'

const MAIN_WH = 'WH-STAREX'

// ------------------------------------------------------------------ pure helpers
export const invoiceWeight = (inv, products) => round2(sum(inv.lines || [], (l) => (products.find((p) => p.id === l.productId)?.weightKg || 0) * l.qty))
export const invoiceCbm = (inv, products) => round2(sum(inv.lines || [], (l) => (products.find((p) => p.id === l.productId)?.cbm || 0) * l.qty))
export const invoiceQty = (inv) => sum(inv.lines || [], (l) => l.qty)

/** Starex rate card: ₹3.4 / kg with ₹450 minimum per consignment */
export const estimateFreight = (inv, products) => Math.max(450, Math.round(invoiceWeight(inv, products) * 3.4))
export const expectedFreight = (inv, products) => (inv.freightCost != null ? inv.freightCost : estimateFreight(inv, products))
/** trucks expected for a consignment (9 t per truck) */
export const expectedTrucks = (inv, products) => Math.max(1, Math.ceil(invoiceWeight(inv, products) / 9000))

/** Safex pickup charge: ₹2.5 / kg, min ₹300 */
export const safexPickupCharge = (inv, products) => Math.max(300, Math.round(invoiceWeight(inv, products) * 2.5))

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[₹,\s]/g, ''))
  return isNaN(n) ? 0 : n
}
const pick = (row, keys) => {
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().replace(/[^a-z]/g, '')
    if (keys.includes(norm)) return row[k]
  }
  return ''
}
/** normalise a raw CSV row from Starex / Safex into {invoiceNo, date, customer, vehicleNo, trucks, freight} */
export const normaliseMisRow = (row) => ({
  invoiceNo: String(pick(row, ['invoiceno', 'invoice', 'invoicenumber', 'invno', 'billno', 'reference', 'ref']) || '').trim(),
  date: String(pick(row, ['date', 'dispatchdate', 'loadingdate', 'lrdate']) || '').trim(),
  customer: String(pick(row, ['customer', 'consignee', 'party', 'client', 'partyname']) || '').trim(),
  lrNo: String(pick(row, ['lrno', 'lr', 'lrnumber']) || '').trim(),
  vehicleNo: String(pick(row, ['vehicleno', 'vehicle', 'truckno', 'truck']) || '').trim(),
  trucks: num(pick(row, ['trucks', 'trucksused', 'noftrucks', 'truckcount'])) || 1,
  freight: num(pick(row, ['freight', 'freightamount', 'amount', 'charges', 'freightcharges', 'billedamount'])),
})

/**
 * Match Starex-reported rows against ERP invoices.
 * Returns results [{ref, invoiceId, status, note, amount, expected, diff, trucks, resolved}]
 */
export const matchMisRows = (state, rawRows) => {
  const rows = rawRows.map(normaliseMisRow).filter((r) => r.invoiceNo)
  const products = state.products
  const invs = state.invoices.filter((i) => i.type !== 'EXPORT' && i.locationId !== 'WH-GUJ')
  const byNo = new Map(invs.map((i) => [i.number.toUpperCase(), i]))
  const results = []
  const seen = new Set()
  for (const r of rows) {
    const inv = byNo.get(r.invoiceNo.toUpperCase())
    if (!inv) {
      results.push({ ref: r.invoiceNo, invoiceId: null, status: 'EXTRA', note: `Billed by Starex but no matching ERP invoice${r.customer ? ` (${r.customer})` : ''}`, amount: r.freight, expected: 0, diff: r.freight, trucks: r.trucks, resolved: false })
      continue
    }
    if (seen.has(inv.id)) {
      results.push({ ref: r.invoiceNo, invoiceId: inv.id, status: 'MISMATCH', note: 'Duplicate billing line for the same invoice', amount: r.freight, expected: 0, diff: r.freight, trucks: r.trucks, resolved: false })
      continue
    }
    seen.add(inv.id)
    const exp = expectedFreight(inv, products)
    const expTrucks = expectedTrucks(inv, products)
    const diff = round2(r.freight - exp)
    const notes = []
    if (Math.abs(diff) > Math.max(50, exp * 0.02)) notes.push(diff > 0 ? `Over-charged by ${fmtINR(diff)}` : `Under-charged by ${fmtINR(-diff)}`)
    if (r.trucks > expTrucks) notes.push(`${r.trucks} trucks billed vs ${expTrucks} required`)
    if (inv.status !== 'DISPATCHED') notes.push('Billed before LR / dispatch recorded in ERP')
    results.push({ ref: inv.number, invoiceId: inv.id, status: notes.length ? 'MISMATCH' : 'MATCH', note: notes.join(' · ') || 'Freight and trucks agree with ERP', amount: r.freight, expected: exp, diff, trucks: r.trucks, resolved: false })
  }
  // MISSING: ERP dispatches in the reported period that Starex did not report
  const dates = rows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  if (dates.length) {
    const from = dates[0], to = dates[dates.length - 1]
    for (const inv of invs) {
      if (inv.status !== 'DISPATCHED' || seen.has(inv.id) || inv.safex || inv.transporterId === 't1') continue
      const d = inv.lr?.date || inv.dispatchDate
      if (d >= from && d <= to) results.push({ ref: inv.number, invoiceId: inv.id, status: 'MISSING', note: 'Dispatched in ERP but not in Starex report', amount: 0, expected: expectedFreight(inv, products), diff: -expectedFreight(inv, products), trucks: 0, resolved: false })
    }
  }
  return results
}

export const misSummary = (results = []) => {
  const c = { MATCH: 0, MISMATCH: 0, MISSING: 0, EXTRA: 0 }
  for (const r of results) c[r.status] = (c[r.status] || 0) + 1
  const total = results.length || 1
  const billed = sum(results, (r) => r.amount)
  const expected = sum(results.filter((r) => r.status !== 'MISSING'), (r) => r.expected)
  const overbilled = sum(results.filter((r) => (r.status === 'MISMATCH' || r.status === 'EXTRA') && r.diff > 0), (r) => r.diff)
  const open = results.filter((r) => r.status !== 'MATCH' && !r.resolved).length
  return { ...c, total: results.length, mismatchRate: round2(((results.length - c.MATCH) / total) * 100), accuracy: round2((c.MATCH / total) * 100), billed, expected, overbilled, open }
}

// ------------------------------------------------------------------ slice
export const dispatchSlice = (set, get) => {
  const uniqueNo = (key, col, field = 'number') => {
    let no = get().nextNo(key)
    let guard = 0
    while ((get()[col] || []).some((x) => x[field] === no) && guard++ < 500) no = get().nextNo(key)
    return no
  }
  return {
    /** called by core createInvoice when transporter is Safex */
    raiseSafexDebitNote: (invoiceId) => {
      const s = get()
      const inv = s.invoices.find((x) => x.id === invoiceId)
      if (!inv) return null
      if ((s.notes || []).some((n) => n.invoiceId === invoiceId && n.source === 'SAFEX')) return null
      const partner = s.partners.find((p) => p.id === inv.partnerId)
      const amount = safexPickupCharge(inv, s.products)
      const number = uniqueNo('DN', 'notes')
      const note = get().addItem('notes', {
        id: uid('dn'), number, type: 'DEBIT', partnerId: inv.partnerId, vendorId: 'lg2', invoiceId, amount, gst: round2(amount * 0.18), total: round2(amount * 1.18),
        reason: `Safex pickup charges for ${inv.number} (${invoiceWeight(inv, s.products)} kg)`, source: 'SAFEX', date: today(), status: 'ISSUED', createdBy: s.session.userId, createdAt: nowISO(),
      })
      set((st) => ({ invoices: st.invoices.map((x) => (x.id === invoiceId ? { ...x, safex: true, safexDebitNoteId: note.id, safexCharge: amount } : x)) }))
      get().sendEmail({ to: partner?.email, subject: `Debit note ${number} – Safex pickup charges`, body: `Dear ${partner?.contact},\n\nAs your consignment against ${inv.number} is collected by Safex Transport from our warehouse, a debit note ${number} for ${fmtINR(amount * 1.18)} (incl. GST) has been raised towards pickup charges.\n\nRegards,\nBtali Dispatch`, attachments: [makeAttachment(`${number.replace(/\//g, '-')}.pdf`)], ref: number })
      get().notify({ title: 'Safex debit note raised', body: `${number} · ${partner?.name} · ${fmtINR(amount * 1.18)}`, link: '/erp/dispatch/special', roles: ['ACCOUNTS', 'DISPATCH'] })
      get().audit('Raised Safex debit note', 'Note', number)
      return note
    },

    /** Tag / untag a customer as a Safex customer (Transport Master) */
    setPartnerSafex: (partnerId, on) => {
      get().updateItem('partners', partnerId, (p) => ({
        ...p, safex: on,
        prevTransporterId: on ? (p.transporterId !== 't1' ? p.transporterId : p.prevTransporterId) : p.prevTransporterId,
        transporterId: on ? 't1' : (p.transporterId === 't1' ? (p.prevTransporterId || 't2') : p.transporterId),
      }))
      const p = get().partners.find((x) => x.id === partnerId)
      get().audit(on ? 'Tagged Safex customer' : 'Removed Safex tag', 'Partner', p?.name)
    },
    /** Update Transport Master mapping for a customer */
    setPartnerTransporter: (partnerId, transporterId) => {
      get().updateItem('partners', partnerId, (p) => ({ ...p, transporterId, safex: transporterId === 't1' }))
      get().audit('Updated transport mapping', 'Partner', get().partners.find((x) => x.id === partnerId)?.name)
    },
    resendInvoiceEmail: (invoiceId) => {
      const s = get()
      const inv = s.invoices.find((x) => x.id === invoiceId)
      const p = s.partners.find((x) => x.id === inv.partnerId)
      get().sendEmail({ to: p.email, subject: `Invoice ${inv.number} – Btali International (copy)`, body: `Dear ${p.contact},\n\nPlease find attached a copy of invoice ${inv.number} for ${fmtINR(inv.total)}.${inv.lr ? `\nLR No. ${inv.lr.number} dated ${inv.lr.date} is also attached.` : ''}\n\nRegards,\nBtali Dispatch`, attachments: [makeAttachment(`${inv.number.replace(/\//g, '-')}.pdf`), ...(inv.lr?.file ? [inv.lr.file] : [])], ref: inv.number })
      set((st) => ({ invoices: st.invoices.map((x) => (x.id === invoiceId ? { ...x, emailed: true, lastEmailedAt: nowISO() } : x)) }))
      get().audit('Re-sent invoice email', 'Invoice', inv.number)
    },

    // -------------------------------------------------------------- schedule / Starex floor
    confirmDispatchSchedule: ({ date, invoiceIds, email = true, attachment = null }) => {
      const s = get()
      const existing = (s.dispatchSchedules || []).find((x) => x.date === date)
      const rec = { id: existing?.id || uid('ds'), date, invoiceIds, confirmedAt: nowISO(), confirmedBy: s.session.userId, emailedAt: email ? nowISO() : existing?.emailedAt || null, revision: (existing?.revision || 0) + 1 }
      set((st) => ({ dispatchSchedules: [rec, ...(st.dispatchSchedules || []).filter((x) => x.date !== date)] }))
      if (email) {
        get().sendEmail({ to: 'ops@starex3pl.in', cc: 'sunil.starex@btali.in', subject: `Btali dispatch schedule for ${date} (${invoiceIds.length} invoices)`, body: `Dear Starex team,\n\nPlease find attached the confirmed dispatch schedule for ${date} covering ${invoiceIds.length} invoice(s). Kindly plan loading and vehicles accordingly.\n\nRegards,\nBtali Dispatch`, attachments: [attachment || makeAttachment(`Dispatch-Schedule-${date}.xlsx`)], ref: `SCHEDULE ${date}`, kind: 'STAREX_SCHEDULE' })
        get().notify({ title: 'Dispatch schedule confirmed', body: `${date} · ${invoiceIds.length} invoices`, link: '/starex/schedule', roles: ['STAREX'] })
      }
      get().audit('Confirmed dispatch schedule', 'Schedule', date)
      return rec
    },
    setStarexStage: (invoiceId, stage) => {
      const by = get().session.userId
      set((st) => ({
        invoices: st.invoices.map((x) => (x.id === invoiceId ? { ...x, starexStage: stage, [stage === 'PICKED' ? 'pickedAt' : stage === 'LOADED' ? 'loadedAt' : 'stagedAt']: nowISO(), starexBy: by } : x)),
      }))
      const inv = get().invoices.find((x) => x.id === invoiceId)
      if (stage === 'LOADED') get().notify({ title: 'Goods loaded at Starex', body: `${inv.number} – LR to follow`, link: '/erp/dispatch/lr', roles: ['DISPATCH'] })
      get().audit(`Marked ${stage.toLowerCase()}`, 'Invoice', inv?.number)
    },
    saveContainerPlan: (shipmentId, plan) => {
      get().updateItem('shipments', shipmentId, (x) => ({ ...x, starexPlan: { ...(x.starexPlan || {}), ...plan, updatedAt: nowISO(), updatedBy: get().session.userId } }))
      const sh = get().shipments.find((x) => x.id === shipmentId)
      get().notify({ title: 'Warehouse plan updated', body: `${sh.number} · ${plan.bay || ''} ${plan.manpower ? `· ${plan.manpower} loaders` : ''}`, link: '/erp/purchase/shipments', roles: ['PURCHASE', 'DISPATCH'] })
      get().audit('Updated container inward plan', 'Shipment', sh.number)
    },

    // -------------------------------------------------------------- returns & FOC
    logReturn: ({ invoiceId, lines, type, reason, attachments = [] }) => {
      const s = get()
      const inv = s.invoices.find((x) => x.id === invoiceId)
      const partner = s.partners.find((p) => p.id === inv.partnerId)
      const number = uniqueNo('RET', 'returns')
      const value = round2(sum(lines, (l) => l.qty * (inv.lines.find((x) => x.productId === l.productId)?.price || 0)))
      const r = {
        id: uid('ret'), number, invoiceId, invoiceNo: inv.number, partnerId: inv.partnerId, lines, type, reason, status: 'LOGGED', focInvoiceNo: null, date: today(), value, attachments,
        createdBy: s.session.userId, timeline: [{ ts: nowISO(), text: `Logged against ${inv.number} – ${type.toLowerCase()} requested` }],
      }
      set((st) => ({ returns: [r, ...(st.returns || [])] }))
      const codes = lines.map((l) => l.barcode).filter(Boolean)
      if (codes.length) get().updateUnits(codes, { status: 'RETURNED', locationId: MAIN_WH }, `Returned by ${partner.name}`, number)
      const sp = s.users.find((u) => u.id === partner.salespersonId)
      get().notify({ title: 'Return / defect logged', body: `${number} · ${partner.name} · ${type.toLowerCase()} · ${reason}`, link: '/erp/dispatch/returns', roles: ['SALES_MANAGER'], userIds: sp ? [sp.id] : [] })
      if (sp) get().sendEmail({ to: sp.email, subject: `Return logged ${number} – ${partner.name}`, body: `Hi ${sp.name.split(' ')[0]},\n\nDispatch has logged ${number} against ${inv.number} for ${partner.name}.\nType: ${type}\nReason: ${reason}\n\nPlease coordinate with the dealer.\n\nBtali Dispatch`, ref: number })
      get().audit('Logged return', 'Return', number)
      return r
    },
    processReturn: (id, remark = '') => {
      const s = get()
      const r = (s.returns || []).find((x) => x.id === id)
      if (!r) return { ok: false, error: 'Return not found' }
      const inv = s.invoices.find((x) => x.id === r.invoiceId)
      const partner = s.partners.find((p) => p.id === r.partnerId)
      if (r.type === 'REPLACEMENT') {
        const short = r.lines.filter((l) => (s.stock[MAIN_WH]?.[l.productId] || 0) < l.qty)
        if (short.length) return { ok: false, error: 'Insufficient stock for replacement', shortages: short.map((l) => ({ productId: l.productId, need: l.qty, have: s.stock[MAIN_WH]?.[l.productId] || 0 })) }
        const n = Math.max(0, ...s.invoices.filter((x) => x.type === 'FOC').map((x) => Number(x.number.split('/').pop()) || 0), ...(s.returns || []).map((x) => Number(String(x.focInvoiceNo || '').split('/').pop()) || 0)) + 1
        const number = `FOC/26-27/${String(n).padStart(4, '0')}`
        const lines = r.lines.map((l) => ({ productId: l.productId, qty: l.qty, price: 0, mrp: s.products.find((p) => p.id === l.productId)?.mrp, discountPct: 100, amount: 0, free: true }))
        const foc = {
          id: uid('inv'), number, soId: inv?.soId || null, partnerId: r.partnerId, date: today(), lines, subtotal: 0, gst: 0, total: 0, transporterId: partner.transporterId, vehicleNo: '', status: 'ISSUED', lr: null,
          sentToStarex: true, emailed: true, irn: '', ewayBill: String(Date.now()).slice(-12), type: 'FOC', dispatchDate: addDays(today(), 1), units: [], locationId: MAIN_WH, safex: partner.transporterId === 't1', returnId: id, againstInvoice: inv?.number,
        }
        for (const l of r.lines) get().adjustStock(MAIN_WH, l.productId, -l.qty, 'FOC replacement', number)
        set((st) => ({ invoices: [foc, ...st.invoices] }))
        get().updateItem('returns', id, (x) => ({ ...x, status: 'IN_PROCESS', focInvoiceNo: number, focInvoiceId: foc.id, timeline: [...x.timeline, { ts: nowISO(), text: `FOC replacement invoice ${number} issued – pushed to Starex schedule${remark ? ` (${remark})` : ''}` }] }))
        get().sendEmail({ to: partner.email, subject: `Replacement dispatch ${number} against ${inv?.number}`, body: `Dear ${partner.contact},\n\nA free-of-cost replacement (${number}) has been issued against ${inv?.number}. It will be dispatched in the next schedule.\n\nRegards,\nBtali Dispatch`, attachments: [makeAttachment(`${number.replace(/\//g, '-')}.pdf`)], ref: number })
        get().notify({ title: 'FOC replacement in schedule', body: `${number} · ${partner.name}`, link: '/starex/schedule', roles: ['STAREX'] })
        get().notify({ title: 'Replacement issued', body: `${r.number} → ${number} for ${partner.name}`, link: '/erp/dispatch/returns', roles: ['SALES_MANAGER', 'SALES_EXEC'] })
        get().audit('Issued FOC replacement', 'Invoice', number)
        return { ok: true, invoice: foc }
      }
      if (r.type === 'DISCOUNT') {
        const number = uniqueNo('CN', 'notes')
        const amount = r.value || 0
        get().addItem('notes', { id: uid('cn'), number, type: 'CREDIT', partnerId: r.partnerId, invoiceId: r.invoiceId, amount, gst: round2(amount * 0.18), total: round2(amount * 1.18), reason: `Return ${r.number}: ${r.reason}`, source: 'RETURN', date: today(), status: 'ISSUED', createdBy: s.session.userId, createdAt: nowISO() })
        get().updateItem('returns', id, (x) => ({ ...x, status: 'IN_PROCESS', creditNoteNo: number, timeline: [...x.timeline, { ts: nowISO(), text: `Credit note ${number} for ${fmtINR(amount * 1.18)} raised${remark ? ` (${remark})` : ''}` }] }))
        get().sendEmail({ to: partner.email, subject: `Credit note ${number} – Btali International`, body: `Dear ${partner.contact},\n\nA credit note ${number} for ${fmtINR(amount * 1.18)} has been issued against ${inv?.number}.\n\nRegards,\nBtali Dispatch`, attachments: [makeAttachment(`${number.replace(/\//g, '-')}.pdf`)], ref: number })
        get().notify({ title: 'Credit note raised (return)', body: `${number} · ${partner.name} · ${fmtINR(amount * 1.18)}`, link: '/erp/accounts', roles: ['ACCOUNTS', 'SALES_MANAGER'] })
        get().audit('Raised credit note', 'Note', number)
        return { ok: true, number }
      }
      get().updateItem('returns', id, (x) => ({ ...x, status: 'IN_PROCESS', timeline: [...x.timeline, { ts: nowISO(), text: `Sent for repair${remark ? ` – ${remark}` : ''}` }] }))
      get().notify({ title: 'Return sent for repair', body: `${r.number} · ${partner.name}`, link: '/erp/dispatch/returns', roles: ['SERVICE', 'SALES_MANAGER'] })
      return { ok: true }
    },
    closeReturn: (id, remark = '') => {
      const r = (get().returns || []).find((x) => x.id === id)
      get().updateItem('returns', id, (x) => ({ ...x, status: 'CLOSED', closedAt: nowISO(), timeline: [...x.timeline, { ts: nowISO(), text: `Closed${remark ? ` – ${remark}` : ''}` }] }))
      get().notify({ title: 'Return closed', body: `${r.number}${remark ? ` – ${remark}` : ''}`, link: '/erp/dispatch/returns', roles: ['SALES_MANAGER'], partnerId: r.partnerId })
      get().audit('Closed return', 'Return', r.number)
    },

    // -------------------------------------------------------------- MIS / reconciliation
    uploadMIS: ({ source = 'STAREX', kind = 'WEEKLY_TRUCK', period = '', fileName = 'report.csv', rows, file = null }) => {
      const s = get()
      const results = matchMisRows(s, rows)
      const sm = misSummary(results)
      const up = { id: uid('mis'), source, kind, period, fileName, file, rows, results, uploadedBy: s.session.userId, uploadedAt: nowISO(), status: sm.open ? 'OPEN' : 'MATCHED' }
      set((st) => ({ misUploads: [up, ...(st.misUploads || [])] }))
      if (sm.open) get().notify({ title: `${source === 'STAREX' ? 'Starex' : source} ${kind === 'MONTHLY_MIS' ? 'MIS' : 'truck report'}: ${sm.open} exceptions`, body: `${period} · ${sm.MISMATCH} mismatch · ${sm.EXTRA} extra · ${sm.MISSING} missing`, type: 'warning', link: '/erp/dispatch/reconciliation', roles: ['DISPATCH', 'ACCOUNTS'] })
      get().audit('Uploaded MIS', 'MIS', `${source} ${period}`)
      return up
    },
    resolveMisResult: (uploadId, idx, note) => {
      const by = get().session.userId
      get().updateItem('misUploads', uploadId, (u) => {
        const results = u.results.map((r, i) => (i === idx ? { ...r, resolved: true, resolution: note, resolvedBy: by, resolvedAt: nowISO() } : r))
        return { ...u, results, status: results.some((r) => r.status !== 'MATCH' && !r.resolved) ? 'OPEN' : 'RESOLVED' }
      })
      get().audit('Resolved reconciliation exception', 'MIS', uploadId)
    },
    removeMisUpload: (uploadId) => get().removeItem('misUploads', uploadId),

    // -------------------------------------------------------------- Gujarat facility (virtual warehouse)
    createGujaratOrder: ({ partnerId, lines, transport = {}, note = '' }) => {
      const so = get().createSalesOrder({ partnerId, lines, source: 'SALES', warehouseId: 'WH-GUJ', note: note || 'Gujarat facility direct delivery' })
      get().updateItem('salesOrders', so.id, (x) => ({ ...x, gujarat: true, gujTransport: { ...transport, capturedAt: nowISO() }, timeline: [...x.timeline, { ts: nowISO(), text: 'Routed to Gujarat facility (virtual warehouse WH-GUJ)' }] }))
      get().notify({ title: 'Gujarat facility order', body: `${so.number} – awaiting advance`, link: '/erp/dispatch/special', roles: ['DISPATCH', 'ACCOUNTS'] })
      return so
    },
    updateGujaratTransport: (soId, transport) => {
      get().updateItem('salesOrders', soId, (x) => ({ ...x, gujTransport: { ...(x.gujTransport || {}), ...transport, capturedAt: nowISO() }, timeline: [...x.timeline, { ts: nowISO(), text: `Transport details captured: ${transport.transporterName || ''} ${transport.vehicleNo || ''}` }] }))
      const so = get().salesOrders.find((x) => x.id === soId)
      get().sendEmail({ to: 'dispatch@gujfacility.in', subject: `Transport details for ${so.number}`, body: `Transporter: ${transport.transporterName}\nVehicle: ${transport.vehicleNo}\nDriver: ${transport.driver || '-'} ${transport.driverPhone || ''}\nNotes: ${transport.notes || '-'}`, ref: so.number })
    },
    markGujaratDelivered: (soId, { date = today(), pod = null } = {}) => {
      const s = get()
      const so = s.salesOrders.find((x) => x.id === soId)
      const inv = s.invoices.find((x) => x.id === so.invoiceId)
      set((st) => ({
        salesOrders: st.salesOrders.map((x) => (x.id === soId ? { ...x, status: 'DELIVERED', deliveredAt: date, timeline: [...x.timeline, { ts: nowISO(), text: 'Delivered by Gujarat facility to client' }] } : x)),
        invoices: st.invoices.map((x) => (x.id === so.invoiceId ? { ...x, status: 'DISPATCHED', deliveredAt: date, lr: x.lr || { number: `GUJ-${so.number.split('/').pop()}`, date, file: pod || makeAttachment(`POD-${so.number.replace(/\//g, '-')}.pdf`), uploadedBy: s.session.userId, uploadedAt: nowISO() } } : x)),
      }))
      const p = s.partners.find((x) => x.id === so.partnerId)
      get().notify({ title: 'Gujarat delivery completed', body: `${so.number} · ${p?.name}`, link: '/erp/dispatch/special', roles: ['DISPATCH', 'PURCHASE', 'SALES_MANAGER'] })
      get().audit('Gujarat delivery completed', 'SO', so.number)
      return inv
    },
  }
}

/**
 * Builds Starex-format report rows for ERP dispatches between from..to (inclusive).
 * inject=true adds realistic billing errors (over-charge, extra truck, unknown invoice, an omitted dispatch).
 */
export const buildMisRows = (state, from, to, { inject = true, seed = 1 } = {}) => {
  const products = state.products
  const list = state.invoices
    .filter((i) => i.status === 'DISPATCHED' && i.type !== 'EXPORT' && i.locationId !== 'WH-GUJ' && i.transporterId !== 't1' && !i.safex)
    .filter((i) => { const d = i.lr?.date || i.dispatchDate; return d >= from && d <= to })
    .sort((a, b) => ((a.lr?.date || a.dispatchDate) < (b.lr?.date || b.dispatchDate) ? -1 : 1))
  const tr = (id) => state.transporters.find((t) => t.id === id)
  const rows = list.map((inv) => ({
    'Date': inv.lr?.date || inv.dispatchDate,
    'Invoice No': inv.number,
    'Customer': state.partners.find((p) => p.id === inv.partnerId)?.name || '',
    'LR No': inv.lr?.number || '',
    'Transporter': tr(inv.transporterId)?.name || '',
    'Vehicle No': inv.vehicleNo || tr(inv.transporterId)?.vehicleNo || '',
    'Trucks': expectedTrucks(inv, products),
    'Weight (kg)': invoiceWeight(inv, products),
    'Freight': expectedFreight(inv, products),
  }))
  if (inject && rows.length >= 4) {
    const k = seed % 2
    rows[1 + k]['Freight'] = Math.round(rows[1 + k]['Freight'] * 1.35 + 220)
    rows[rows.length - 2]['Trucks'] = 2
    rows[rows.length - 2]['Freight'] = rows[rows.length - 2]['Freight'] + 1800
    rows.splice(3 + k, 1)
    rows.push({ 'Date': to, 'Invoice No': `BT/26-27/${String(9100 + seed * 7).padStart(4, '0')}`, 'Customer': 'Unidentified consignee', 'LR No': `SX${700100 + seed}`, 'Transporter': 'Om Sai Roadways', 'Vehicle No': 'MH04 GT 5521', 'Trucks': 1, 'Weight (kg)': 640, 'Freight': 2350 })
  }
  return rows
}
