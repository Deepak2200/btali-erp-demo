// Store actions for the "service" module: ticket routing, claims, vendor escalation, public website intake.
import { nowISO, makeAttachment, fmtDate, addDays } from '../../lib/format'
import { MAIN_WH } from '../../lib/stock'

// ------------------------------------------------------------------ shared constants / pure helpers
export const TICKET_STAGES = [
  { key: 'LOGGED', label: 'Logged', tone: 'amber' },
  { key: 'UNDER_REVIEW', label: 'Under Review', tone: 'violet' },
  { key: 'IN_PROGRESS', label: 'In Progress', tone: 'blue' },
  { key: 'RESOLVED', label: 'Resolved', tone: 'green' },
  { key: 'CLOSED', label: 'Closed', tone: 'gray' },
]
export const CATEGORY_LABEL = {
  PRODUCT_DEFECT: 'Product Defect', INSTALLATION: 'Installation', SPARE_REQUIREMENT: 'Spare Requirement', WARRANTY_CLAIM: 'Warranty Claim',
  GENERAL: 'General Complaint', DAMAGE_IN_TRANSIT: 'Damage in Transit', SHORTAGE: 'Shortage', MISLABEL: 'Mislabel', VENDOR_ISSUE: 'Vendor Issue',
}
export const SOURCE_LABEL = { DEALER: 'Dealer', FRANCHISE: 'Franchise', VENDOR: 'Vendor', STAREX: 'Starex', INTERNAL: 'Internal', WEBSITE: 'Website', TOLL_FREE: 'Toll-free' }
export const RESPONSE_TYPES = { REPLACEMENT: 'Free replacement', CREDIT_NOTE: 'Credit note', REPAIR_INSTRUCTIONS: 'Repair instructions / spare kit', REJECTED: 'Not accepted' }

const CITY_REGION = {
  mumbai: 'West', 'navi mumbai': 'West', thane: 'West', pune: 'West', baramati: 'West', nashik: 'West', ahmedabad: 'West', surat: 'West', vadodara: 'West', rajkot: 'West', goa: 'West', margao: 'West', panaji: 'West', kolhapur: 'West', aurangabad: 'West',
  delhi: 'North', 'new delhi': 'North', noida: 'North', gurugram: 'North', gurgaon: 'North', chandigarh: 'North', ludhiana: 'North', amritsar: 'North', jalandhar: 'North', jaipur: 'North', lucknow: 'North', kanpur: 'North', varanasi: 'North', agra: 'North', dehradun: 'North',
  bengaluru: 'South', bangalore: 'South', chennai: 'South', coimbatore: 'South', hyderabad: 'South', kochi: 'South', cochin: 'South', madurai: 'South', mysuru: 'South', mysore: 'South', vijayawada: 'South', visakhapatnam: 'South', trivandrum: 'South', thiruvananthapuram: 'South', salem: 'South',
  kolkata: 'East', patna: 'East', bhubaneswar: 'East', guwahati: 'East', ranchi: 'East', cuttack: 'East', siliguri: 'East',
  indore: 'Central', bhopal: 'Central', nagpur: 'Central', raipur: 'Central', jabalpur: 'Central', gwalior: 'Central',
}
const PIN_CITY = { 400: 'mumbai', 401: 'mumbai', 410: 'navi mumbai', 411: 'pune', 412: 'pune', 413: 'baramati', 422: 'nashik', 440: 'nagpur', 380: 'ahmedabad', 382: 'ahmedabad', 395: 'surat', 360: 'rajkot', 302: 'jaipur', 141: 'ludhiana', 143: 'amritsar', 110: 'new delhi', 226: 'lucknow', 560: 'bengaluru', 600: 'chennai', 641: 'coimbatore', 500: 'hyderabad', 682: 'kochi', 700: 'kolkata', 751: 'bhubaneswar', 781: 'guwahati', 800: 'patna', 452: 'indore', 492: 'raipur', 403: 'margao' }
const pinRegion = (pin) => {
  const s = String(pin || '').trim()
  if (!/^\d{6}$/.test(s)) return null
  const n = Number(s.slice(0, 2))
  if (n >= 11 && n <= 34) return 'North'
  if (n >= 36 && n <= 44) return 'West'
  if (n >= 45 && n <= 49) return 'Central'
  if (n >= 50 && n <= 69) return 'South'
  if (n >= 70 && n <= 85) return 'East'
  return null
}
const norm = (s) => String(s || '').trim().toLowerCase()

export const servicePartners = (state) => state.partners.filter((p) => (p.type === 'DEALER' || p.type === 'FRANCHISE') && p.status === 'ACTIVE')

/** Nearest dealer / franchise for a customer location. Returns {partner, match:'CITY'|'REGION'|null, region} */
export const nearestPartner = (state, { city, pincode } = {}) => {
  const list = servicePartners(state)
  const c = norm(city) || PIN_CITY[String(pincode || '').slice(0, 3)] || ''
  const rank = (p) => (p.type === 'FRANCHISE' ? 0 : 1) * 10 + ({ A: 0, B: 1, C: 2 }[p.tier] ?? 3)
  const best = (arr) => [...arr].sort((a, b) => rank(a) - rank(b))[0]
  const sameCity = list.filter((p) => norm(p.city) === c)
  const region = CITY_REGION[c] || pinRegion(pincode) || list.find((p) => norm(p.city) === c)?.region || null
  if (sameCity.length) return { partner: best(sameCity), match: 'CITY', region: sameCity[0].region }
  const sameRegion = region ? list.filter((p) => p.region === region) : []
  if (sameRegion.length) return { partner: best(sameRegion), match: 'REGION', region }
  return { partner: null, match: null, region }
}

export const slaDue = (t) => new Date(new Date(t.createdAt).getTime() + (t.slaHours || 72) * 3600000).toISOString()
/** {overdue, hoursLeft, done} */
/** When a ticket was resolved (falls back to the last stage update for older tickets). */
export const resolvedAtOf = (t) => {
  if (t.stage !== 'RESOLVED' && t.stage !== 'CLOSED') return null
  return t.resolvedAt || [...(t.updates || [])].reverse().find((u) => u.stage === 'RESOLVED' || u.stage === 'CLOSED')?.ts || null
}
export const slaState = (t) => {
  const done = t.stage === 'RESOLVED' || t.stage === 'CLOSED'
  const end = done ? new Date(resolvedAtOf(t) || t.createdAt).getTime() : Date.now()
  const due = new Date(slaDue(t)).getTime()
  const hoursLeft = Math.round((due - end) / 3600000)
  return { done, overdue: hoursLeft < 0, hoursLeft, breached: done && hoursLeft < 0 }
}
export const escalatedAtOf = (t) => t.escalatedAt || t.updates?.find((u) => /escalat/i.test(u.text || ''))?.ts || t.createdAt

/** Public ticket lookup (website). */
export const findPublicTicket = (state, number, phone) => {
  const n = String(number || '').trim().toUpperCase().replace(/\s+/g, '')
  const ph = String(phone || '').replace(/\D/g, '').slice(-10)
  const t = state.tickets.find((x) => x.number.toUpperCase() === n || x.number.toUpperCase().replace('TKT-', '') === n.replace('TKT-', '').padStart(5, '0'))
  if (!t) return { ok: false, error: 'No service request found with this reference number.' }
  const phones = [t.customer?.phone, state.partners.find((p) => p.id === t.partnerId)?.phone].filter(Boolean).map((x) => String(x).replace(/\D/g, '').slice(-10))
  if (!ph || !phones.includes(ph)) return { ok: false, error: 'The mobile number does not match our records for this request.' }
  return { ok: true, ticket: t }
}

/** Public invoice lookup (website). */
export const findPublicInvoice = (state, number, phoneOrGstin) => {
  const n = String(number || '').trim().toUpperCase()
  const inv = state.invoices.find((x) => x.number.toUpperCase() === n || x.number.toUpperCase().replace(/\//g, '-') === n)
  if (!inv) return { ok: false, error: 'Invoice number not found.' }
  const partner = state.partners.find((p) => p.id === inv.partnerId)
  const key = String(phoneOrGstin || '').trim().toUpperCase()
  const digits = key.replace(/\D/g, '').slice(-10)
  const okGst = partner?.gstin && key === partner.gstin.toUpperCase()
  const okPhone = digits.length === 10 && String(partner?.phone || '').replace(/\D/g, '').slice(-10) === digits
  if (!okGst && !okPhone) return { ok: false, error: 'Registered mobile number or GSTIN does not match this invoice.' }
  return { ok: true, invoice: inv, partner }
}

const smsTo = (get, phone, body, ref) => phone && get().sendEmail({ to: phone, subject: 'SMS', body, ref, kind: 'SMS' })

// ------------------------------------------------------------------ actions
export const serviceSlice = (set, get) => ({
  /** Customer / toll-free / website intake with automatic routing. */
  svcLogServiceRequest: ({ source = 'WEBSITE', customer = {}, productId, barcode, category = 'PRODUCT_DEFECT', description = '', attachments = [], priority = 'MEDIUM', autoRoute = true, subject }) => {
    const s = get()
    const code = String(barcode || '').trim().toUpperCase()
    const unit = code ? s.units.find((u) => u.code.toUpperCase() === code) : null
    const pid = productId || unit?.productId || null
    const product = s.products.find((p) => p.id === pid)
    const near = autoRoute ? nearestPartner(s, customer) : { partner: null }
    const partner = near.partner
    const ticket = get().createTicket({
      source, category, priority,
      subject: subject || `${CATEGORY_LABEL[category] || 'Service'} – ${product?.shortName || product?.name || 'Btali product'}`,
      description, productId: pid, barcode: unit?.code || (code || null), customer,
      attachments, partnerId: partner?.id || null, routedPartnerId: partner?.id || null,
      routedMatch: near.match || null, assigneeId: partner ? null : 'u11',
      updates: [{ ts: nowISO(), by: s.session.userId, public: true, text: `Request registered via ${source === 'TOLL_FREE' ? 'toll-free helpline' : source === 'WEBSITE' ? 'btali.in' : source.toLowerCase()}.` },
        { ts: nowISO(), by: s.session.userId, public: true, text: partner ? `Assigned to authorised service partner ${partner.name}, ${partner.city} (${partner.phone}).` : 'Assigned to Btali central service team.' }],
    })
    const ref = ticket.number
    smsTo(get, customer.phone, `Btali: Service request ${ref} registered. ${partner ? `${partner.name} (${partner.phone}) will contact you within 24 hrs.` : 'Btali service team will call you within 24 hrs.'} Track at btali.in/track`, ref)
    if (customer.email) get().sendEmail({ to: customer.email, subject: `Service request ${ref} registered – Btali`, body: `Dear ${customer.name},\n\nThank you for contacting Btali. Your service request ${ref} has been registered.\n\n${partner ? `Service partner: ${partner.name}, ${partner.address || partner.city}\nPhone: ${partner.phone}` : 'Handled by: Btali Service Team, 1800 266 7700'}\n\nYou can track the status anytime at btali.in/track using your reference number and mobile number.\n\nRegards,\nBtali Customer Care`, ref })
    if (partner) {
      get().notify({ title: 'Service request assigned to you', body: `${ref} · ${customer.name || ''}, ${customer.city || ''} · ${product?.shortName || ''}`, partnerId: partner.id, link: partner.type === 'FRANCHISE' ? '/franchise/dashboard' : '/dealer/support' })
      get().sendEmail({ to: partner.email, subject: `New service request ${ref} – ${customer.city || ''}`, body: `Dear ${partner.contact},\n\nA customer service request has been routed to you as the nearest authorised Btali partner.\n\nCustomer: ${customer.name} (${customer.phone})\nCity: ${customer.city} ${customer.pincode || ''}\nProduct: ${product?.name || '—'} ${unit ? `(${unit.code})` : ''}\nIssue: ${CATEGORY_LABEL[category]} – ${description}\n\nPlease contact the customer within 24 hours and update the ticket.\n\nRegards,\nBtali Service`, ref })
    }
    get().audit('Service request logged', 'Ticket', ref)
    return { ticket: get().tickets.find((t) => t.id === ticket.id), partner, match: near.match }
  },

  /** Route to dealer/franchise (partnerId) or assign in-house (assigneeId). */
  svcRouteTicket: (id, { partnerId, assigneeId, note = '' }) => {
    const s = get()
    const t = s.tickets.find((x) => x.id === id)
    const stage = t.stage === 'LOGGED' ? 'UNDER_REVIEW' : undefined
    if (partnerId) {
      const p = s.partners.find((x) => x.id === partnerId)
      get().updateTicket(id, { routedPartnerId: partnerId, partnerId: t.partnerId || partnerId, assigneeId: null, stage, note: `Routed to ${p.name}, ${p.city} for resolution.${note ? ` ${note}` : ''}` })
      get().notify({ title: 'Service ticket routed to you', body: `${t.number}: ${t.subject}`, partnerId, link: p.type === 'FRANCHISE' ? '/franchise/dashboard' : '/dealer/support' })
      get().sendEmail({ to: p.email, subject: `Service ticket ${t.number} assigned`, body: `Dear ${p.contact},\n\nTicket ${t.number} (${t.subject}) has been assigned to you.${t.customer ? `\nCustomer: ${t.customer.name}, ${t.customer.phone}, ${t.customer.city}` : ''}\n${note}\n\nRegards,\nBtali Service`, ref: t.number })
      smsTo(get, t.customer?.phone, `Btali: Your request ${t.number} is assigned to ${p.name} (${p.phone}). They will contact you shortly.`, t.number)
    } else {
      const u = s.users.find((x) => x.id === assigneeId)
      get().updateTicket(id, { assigneeId, routedPartnerId: null, stage, note: `Assigned to ${u?.name || 'in-house team'}.${note ? ` ${note}` : ''}` })
      if (assigneeId && assigneeId !== s.session.userId) get().notify({ title: `Ticket ${t.number} assigned to you`, body: t.subject, userIds: [assigneeId], link: `/erp/service/tickets?id=${id}` })
    }
    get().audit('Routed ticket', 'Ticket', t.number)
  },

  /** Add a thread note (optionally customer-visible) with attachments; optional stage move. */
  svcAddTicketUpdate: (id, { text, attachments = [], isPublic = false, stage }) => {
    const t = get().tickets.find((x) => x.id === id)
    get().updateTicket(id, { note: text, stage })
    get().updateItem('tickets', id, (x) => {
      const ups = [...x.updates]
      ups[ups.length - 1] = { ...ups[ups.length - 1], public: !!isPublic, attachments }
      return { ...x, updates: ups, attachments: [...(x.attachments || []), ...attachments] }
    })
    if (isPublic) smsTo(get, t.customer?.phone, `Btali: Update on ${t.number} – ${text.slice(0, 120)}`, t.number)
  },

  svcCloseTicket: (id, { resolution = '', stage = 'CLOSED' } = {}) => {
    const t = get().tickets.find((x) => x.id === id)
    get().updateTicket(id, { stage, resolution, note: `${stage === 'RESOLVED' ? 'Resolved' : 'Closed'}: ${resolution}` })
    get().updateItem('tickets', id, (x) => {
      const ups = [...x.updates]
      ups[ups.length - 1] = { ...ups[ups.length - 1], public: true }
      return { ...x, updates: ups }
    })
    smsTo(get, t.customer?.phone, `Btali: Your service request ${t.number} has been ${stage === 'RESOLVED' ? 'resolved' : 'closed'}. ${resolution.slice(0, 100)} Thank you for choosing Btali.`, t.number)
    if (t.customer?.email) get().sendEmail({ to: t.customer.email, subject: `Service request ${t.number} ${stage.toLowerCase()}`, body: `Dear ${t.customer.name},\n\nYour service request ${t.number} has been ${stage.toLowerCase()}.\nResolution: ${resolution}\n\nRegards,\nBtali Customer Care`, ref: t.number })
    get().audit(`Ticket ${stage.toLowerCase()}`, 'Ticket', t.number)
  },

  svcEscalateTicket: (id, vendorId, note = '', attachments = []) => {
    const s = get()
    const t = s.tickets.find((x) => x.id === id)
    const v = s.vendors.find((x) => x.id === vendorId)
    get().escalateTicketToVendor(id, vendorId, note)
    get().updateItem('tickets', id, (x) => ({ ...x, escalatedAt: nowISO(), vendorStatus: 'AWAITING_VENDOR', vendorResponse: null, attachments: [...(x.attachments || []), ...attachments] }))
    get().sendEmail({ to: v?.email, subject: `Btali service escalation ${t.number}: ${t.subject}`, body: `Dear ${v?.contact},\n\nA field defect has been traced to manufacturing and escalated to you.\n\nTicket: ${t.number}\nIssue: ${t.subject}\n${t.barcode ? `Barcode: ${t.barcode}\n` : ''}${note ? `Btali note: ${note}\n` : ''}\nPlease respond on the Btali Vendor Portal with replacement, credit note or repair instructions.\n\nRegards,\nBtali Service`, attachments, ref: t.number })
    get().audit('Escalated ticket to vendor', 'Ticket', t.number)
  },

  svcSendVendorReminder: (kind, id) => {
    const s = get()
    const rec = kind === 'CLAIM' ? s.warrantyClaims.find((x) => x.id === id) : s.tickets.find((x) => x.id === id)
    const vendorId = kind === 'CLAIM' ? rec.vendorClaim?.vendorId : rec.vendorId
    const v = s.vendors.find((x) => x.id === vendorId)
    const subj = kind === 'CLAIM' ? `${rec.number}: ${rec.issue}` : `${rec.number}: ${rec.subject}`
    get().sendEmail({ to: v?.email, subject: `Reminder: response pending on ${subj}`, body: `Dear ${v?.contact},\n\nThis is a reminder that Btali is awaiting your response on ${subj}.\nPlease update the Btali Vendor Portal at the earliest.\n\nRegards,\nBtali Service`, ref: rec.number })
    get().notify({ title: 'Reminder from Btali Service', body: `Response pending on ${subj}`, type: 'warning', vendorId, link: '/vendor/tickets' })
    const entry = { ts: nowISO(), by: s.session.userId }
    if (kind === 'CLAIM') get().updateItem('warrantyClaims', id, (x) => ({ ...x, vendorClaim: { ...x.vendorClaim, reminders: [...(x.vendorClaim?.reminders || []), entry] }, timeline: [...x.timeline, { ts: nowISO(), text: `Follow-up reminder sent to ${v?.name}` }] }))
    else get().updateItem('tickets', id, (x) => ({ ...x, reminders: [...(x.reminders || []), entry], updates: [...x.updates, { ts: nowISO(), by: s.session.userId, text: `Follow-up reminder sent to ${v?.name}` }] }))
    get().audit('Vendor reminder', kind, rec.number)
  },

  svcRegisterWarranty: (data) => {
    const r = get().registerWarranty(data)
    if (r.ok) {
      const w = r.warranty
      smsTo(get, data.customer?.phone, `Btali: Warranty ${w.number} activated for barcode ${w.barcode}, valid till ${fmtDate(w.endDate)}. Verify anytime at btali.in/warranty`, w.number)
      if (data.customer?.email) get().sendEmail({ to: data.customer.email, subject: `Warranty card ${w.number} – Btali`, body: `Dear ${data.customer.name},\n\nYour Btali warranty ${w.number} for barcode ${w.barcode} is active from ${fmtDate(w.startDate)} to ${fmtDate(w.endDate)}.\n\nRegards,\nBtali Customer Care`, attachments: [makeAttachment(`Warranty-Card-${w.number}.pdf`)], ref: w.number })
      get().audit('Registered warranty', 'Warranty', w.number)
    }
    return r
  },

  svcSetClaimStatus: (id, status, note) => {
    get().updateItem('warrantyClaims', id, (x) => ({ ...x, status, timeline: [...x.timeline, { ts: nowISO(), text: note || `Status → ${status.replace(/_/g, ' ').toLowerCase()}` }] }))
    const c = get().warrantyClaims.find((x) => x.id === id)
    if (c.ticketId && status === 'UNDER_REVIEW') get().updateTicket(c.ticketId, { stage: 'UNDER_REVIEW', note: 'Claim taken up for verification' })
  },

  /** Issue a barcoded replacement unit from warehouse stock against a claim. */
  svcAllocateReplacement: (claimId, code) => {
    const s = get()
    const c = s.warrantyClaims.find((x) => x.id === claimId)
    const unit = s.units.find((u) => u.code === code)
    if (!unit || unit.status !== 'IN_WAREHOUSE') return { ok: false, error: 'Unit is not available in warehouse.' }
    if (unit.productId !== c.productId) return { ok: false, error: 'Replacement must be the same product.' }
    const partner = s.partners.find((p) => p.id === c.partnerId)
    const product = s.products.find((p) => p.id === c.productId)
    get().updateUnits([code], { status: 'AT_PARTNER', partnerId: c.partnerId, locationId: c.partnerId || 'SERVICE' }, `Issued as warranty replacement for ${c.barcode}`, c.number)
    get().updateUnits([c.barcode], { status: 'REPLACED' }, `Replaced under warranty by ${code}`, c.number)
    get().adjustStock(unit.locationId || MAIN_WH, c.productId, -1, 'Warranty replacement', c.number)
    const w = s.warranties.find((x) => x.id === c.warrantyId)
    if (w) {
      get().updateItem('warranties', w.id, { replacementBarcode: code, replacedAt: nowISO() })
      if (!s.warranties.some((x) => x.barcode === code)) {
        set((st) => ({ warranties: [{ ...w, id: `${w.id}r${Date.now().toString(36).slice(-4)}`, number: `${w.number}-R`, barcode: code, replacesBarcode: w.barcode, source: 'WARRANTY_REPLACEMENT', createdAt: nowISO(), replacementBarcode: undefined }, ...st.warranties] }))
      }
    }
    get().updateItem('warrantyClaims', claimId, (x) => ({ ...x, replacementBarcode: code, cost: x.cost || product?.landedCost || 0, replacedAt: nowISO(), timeline: [...x.timeline, { ts: nowISO(), text: `Replacement unit ${code} allocated from warehouse and dispatched to ${partner?.name || 'service centre'}` }] }))
    if (c.ticketId) get().updateTicket(c.ticketId, { note: `Replacement barcode ${code} issued against ${c.barcode}` })
    if (partner) {
      get().notify({ title: 'Warranty replacement allocated', body: `${c.number}: new unit ${code} dispatched`, partnerId: partner.id, link: '/dealer/warranty' })
      get().sendEmail({ to: partner.email, subject: `Replacement allocated – ${c.number}`, body: `Dear ${partner.contact},\n\nReplacement unit ${code} (${product?.name}) has been allocated against claim ${c.number} for barcode ${c.barcode}. Please hand it over to the customer and return the defective unit.\n\nRegards,\nBtali Service`, ref: c.number })
    }
    get().audit('Allocated replacement', 'Claim', c.number)
    return { ok: true }
  },

  svcEscalateClaimToVendor: (claimId, note = '') => {
    const s = get()
    const c = s.warrantyClaims.find((x) => x.id === claimId)
    const unit = s.units.find((u) => u.code === c.barcode)
    const product = s.products.find((p) => p.id === c.productId)
    const vendorId = unit?.vendorId || product?.vendorId
    const v = s.vendors.find((x) => x.id === vendorId)
    get().updateItem('warrantyClaims', claimId, (x) => ({ ...x, status: 'VENDOR_ESCALATED', vendorClaim: { vendorId, status: 'AWAITING_VENDOR', sentAt: nowISO(), response: null, docs: [], note, reminders: [] }, timeline: [...x.timeline, { ts: nowISO(), text: `Escalated to ${v?.name} via Vendor Portal${note ? ` – ${note}` : ''}` }] }))
    get().notify({ title: 'Warranty claim escalated by Btali', body: `${c.number}: ${c.issue} (${product?.sku}, ${c.barcode})`, type: 'warning', vendorId, link: '/vendor/tickets' })
    get().sendEmail({ to: v?.email, subject: `Warranty claim ${c.number} – ${product?.sku}`, body: `Dear ${v?.contact},\n\nBtali has a warranty claim on a unit supplied by you.\n\nClaim: ${c.number}\nProduct: ${product?.name}\nBarcode: ${c.barcode}\nIssue: ${c.issue}\n${note ? `Note: ${note}\n` : ''}\nPlease respond on the Vendor Portal with replacement, credit note or repair instructions.\n\nRegards,\nBtali Service`, ref: c.number })
    if (c.ticketId) get().updateTicket(c.ticketId, { escalatedToVendor: true, vendorId, escalatedAt: nowISO(), note: `Claim escalated to ${v?.name}` })
    get().audit('Escalated claim to vendor', 'Claim', c.number)
  },

  /** Btali records vendor's decision + who bears the cost. */
  svcRecordVendorResponse: (claimId, { accepted = true, response = '', bearer, cost }) => {
    get().updateItem('warrantyClaims', claimId, (x) => ({
      ...x, bearer: bearer || (accepted ? 'VENDOR' : 'BTALI'), cost: cost != null && cost !== '' ? Number(cost) : x.cost,
      vendorClaim: { ...x.vendorClaim, status: accepted ? 'ACCEPTED' : 'REJECTED', response: response || x.vendorClaim?.response, respondedAt: x.vendorClaim?.respondedAt || nowISO(), recordedAt: nowISO() },
      timeline: [...x.timeline, { ts: nowISO(), text: `Vendor ${accepted ? 'accepted' : 'declined'} claim – cost borne by ${bearer || (accepted ? 'VENDOR' : 'BTALI')}${response ? ` (${response})` : ''}` }],
    }))
    const c = get().warrantyClaims.find((x) => x.id === claimId)
    get().audit('Recorded vendor response', 'Claim', c.number)
  },

  svcCloseClaim: (claimId, { remark = '', bearer, cost } = {}) => {
    const c = get().warrantyClaims.find((x) => x.id === claimId)
    get().updateItem('warrantyClaims', claimId, (x) => ({ ...x, status: 'CLOSED', closedAt: nowISO(), bearer: bearer || x.bearer || 'BTALI', cost: cost != null && cost !== '' ? Number(cost) : x.cost, timeline: [...x.timeline, { ts: nowISO(), text: `Closed${remark ? ` – ${remark}` : ''}` }] }))
    if (c.ticketId) get().updateTicket(c.ticketId, { stage: 'CLOSED', note: `Warranty claim closed${remark ? `: ${remark}` : ''}` })
    get().notify({ title: 'Warranty claim closed', body: `${c.number}${remark ? ` – ${remark}` : ''}`, partnerId: c.partnerId, link: '/dealer/warranty' })
    get().audit('Closed claim', 'Claim', c.number)
  },

  svcExpiryWindow: () => addDays(new Date().toISOString().slice(0, 10), 30),
})
