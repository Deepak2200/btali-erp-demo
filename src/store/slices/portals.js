// Store actions for the "portals" module: dealer cart & ordering, payment advice, dealer/franchise stock,
// profile change requests, POS sessions, store inward acknowledgement and franchise replenishment.
import { nowISO, today, round2, sum, uid, fmtINR, makeAttachment } from '../../lib/format'

const isFranchise = (get, partnerId) => get().partners.find((p) => p.id === partnerId)?.type === 'FRANCHISE'
const portalBase = (get, partnerId) => (isFranchise(get, partnerId) ? '/franchise' : '/dealer')

// eslint-disable-next-line no-unused-vars
export const portalsSlice = (set, get, api) => ({
  // ------------------------------------------------------------ cart
  addToCart: (partnerId, productId, qty = 1) => {
    const q = Math.max(1, Number(qty) || 1)
    set((s) => {
      const cart = [...(s.carts?.[partnerId] || [])]
      const i = cart.findIndex((l) => l.productId === productId)
      if (i >= 0) cart[i] = { ...cart[i], qty: cart[i].qty + q }
      else cart.push({ productId, qty: q })
      return { carts: { ...(s.carts || {}), [partnerId]: cart } }
    })
  },
  addLinesToCart: (partnerId, lines = []) => {
    for (const l of lines) if (l.productId && Number(l.qty) > 0) get().addToCart(partnerId, l.productId, l.qty)
  },
  updateCartLine: (partnerId, productId, qty) => {
    const q = Number(qty) || 0
    set((s) => {
      const cart = (s.carts?.[partnerId] || []).map((l) => (l.productId === productId ? { ...l, qty: q } : l)).filter((l) => l.qty > 0)
      return { carts: { ...(s.carts || {}), [partnerId]: cart } }
    })
  },
  removeCartLine: (partnerId, productId) =>
    set((s) => ({ carts: { ...(s.carts || {}), [partnerId]: (s.carts?.[partnerId] || []).filter((l) => l.productId !== productId) } })),
  clearCart: (partnerId) => set((s) => ({ carts: { ...(s.carts || {}), [partnerId]: [] } })),

  /** Dealer / store places the cart as a portal order (goes to Sales review). */
  placePortalOrder: (partnerId, { note = '', transporterId } = {}) => {
    const cart = get().carts?.[partnerId] || []
    if (!cart.length) return { ok: false, error: 'Your cart is empty.' }
    const so = get().createSalesOrder({ partnerId, lines: cart, source: 'PORTAL', note, transporterId })
    const p = get().partners.find((x) => x.id === partnerId)
    get().clearCart(partnerId)
    get().sendEmail({ to: p.email, subject: `Order received ${so.number} – Btali International`, body: `Dear ${p.contact},\n\nThank you for your order ${so.number} for ${fmtINR(so.total)}. Our sales team will review and confirm it shortly. You will receive payment instructions on confirmation.\n\nRegards,\nBtali Sales`, ref: so.number })
    get().notify({ title: 'Order received', body: `${so.number} · ${fmtINR(so.total)} – under review by Btali Sales`, link: `${portalBase(get, partnerId)}/orders`, partnerId })
    return { ok: true, so }
  },

  /** Dealer shares UTR / payment advice against an order. Accounts then records the receipt. */
  submitPaymentAdvice: (soId, { utr, amount, date = today(), mode = 'NEFT', bankId = 'bk1', file = null, remarks = '' }) => {
    const so = get().salesOrders.find((x) => x.id === soId)
    if (!so) return { ok: false, error: 'Order not found' }
    const p = get().partners.find((x) => x.id === so.partnerId)
    const advice = { id: uid('pa'), ts: nowISO(), utr: String(utr).trim().toUpperCase(), amount: round2(amount), date, mode, bankId, file, remarks, by: get().session.userId, status: 'SUBMITTED' }
    get().updateItem('salesOrders', soId, (x) => ({ ...x, paymentAdvices: [...(x.paymentAdvices || []), advice], timeline: [...(x.timeline || []), { ts: nowISO(), text: `Payment advice shared by ${p?.name}: ${mode} ${advice.utr} for ${fmtINR(advice.amount)} – awaiting Accounts confirmation` }] }))
    get().notify({ title: 'Payment advice received', body: `${so.number} · ${p?.name} · ${mode} ${advice.utr} · ${fmtINR(advice.amount)}`, type: 'info', link: '/erp/accounts/receipts', roles: ['ACCOUNTS', 'FINANCE_HEAD'] })
    get().notify({ title: 'Dealer has remitted advance', body: `${so.number} · ${p?.name} · ${fmtINR(advice.amount)}`, link: `/erp/sales/orders/${soId}`, roles: ['SALES_EXEC', 'SALES_MANAGER'] })
    get().sendEmail({ to: 'accounts@btali.in', subject: `Payment advice – ${so.number} – ${p?.name}`, body: `Payment advice received via portal.\n\nOrder: ${so.number}\nDealer: ${p?.name}\nMode: ${mode}\nUTR / Ref: ${advice.utr}\nAmount: ${fmtINR(advice.amount)}\nDate: ${date}\n${remarks ? `Remarks: ${remarks}\n` : ''}\nPlease verify against the bank statement and record the receipt.`, attachments: file ? [file] : [], ref: so.number })
    get().audit('Shared payment advice', 'SO', so.number)
    return { ok: true, advice }
  },

  /** Cancel an order while it is still under Sales review. */
  portalCancelOrder: (soId, reason) => {
    const so = get().salesOrders.find((x) => x.id === soId)
    if (!so || so.status !== 'PENDING_REVIEW') return { ok: false, error: 'Only orders under review can be cancelled from the portal.' }
    get().cancelSalesOrder(soId, `by dealer – ${reason}`)
    const p = get().partners.find((x) => x.id === so.partnerId)
    get().notify({ title: 'Portal order cancelled by dealer', body: `${so.number} · ${p?.name}: ${reason}`, link: `/erp/sales/orders/${soId}`, roles: ['SALES_MANAGER', 'SALES_EXEC'] })
    return { ok: true }
  },

  // ------------------------------------------------------------ dealer / store stock
  updatePartnerStockLevels: (partnerId, { stock = {}, stockMin = {} }) => {
    const p = get().partners.find((x) => x.id === partnerId)
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && !isNaN(v)).map(([k, v]) => [k, Math.max(0, Number(v))]))
    get().updateItem('partners', partnerId, (x) => ({
      ...x,
      stock: { ...(x.stock || {}), ...clean(stock) },
      stockMin: { ...(x.stockMin || {}), ...clean(stockMin) },
      stockUpdatedAt: today(),
      stockLog: [{ ts: nowISO(), by: get().session.userId, items: Object.keys(stock).length }, ...(x.stockLog || [])].slice(0, 30),
    }))
    get().notify({ title: 'Partner stock updated', body: `${p?.name} updated ${Object.keys(stock).length} item(s)`, link: '/erp/sales/dealers', roles: ['SALES_EXEC', 'SALES_MANAGER'] })
    get().audit('Updated partner stock', 'Partner', p?.name)
  },

  // ------------------------------------------------------------ profile & KYC
  portalAddKyc: (partnerId, attachments = [], docType = 'KYC') => {
    const p = get().partners.find((x) => x.id === partnerId)
    const atts = attachments.map((a) => ({ ...a, docType: a.docType || docType, uploadedAt: a.uploadedAt || nowISO(), status: 'PENDING_VERIFICATION' }))
    get().updateItem('partners', partnerId, (x) => ({ ...x, kyc: [...(x.kyc || []), ...atts] }))
    get().notify({ title: 'KYC document uploaded', body: `${p?.name} · ${atts.map((a) => a.docType).join(', ')}`, link: '/erp/sales/dealers', roles: ['SALES_MANAGER'] })
  },
  savePartnerContacts: (partnerId, contacts) => {
    get().updateItem('partners', partnerId, { contacts })
    get().audit('Updated contact persons', 'Partner', partnerId)
  },
  portalRequestProfileChange: (partnerId, { changes, note = '' }) => {
    const p = get().partners.find((x) => x.id === partnerId)
    const req = { id: uid('pcr'), ts: nowISO(), by: get().session.userId, changes, note, status: 'PENDING' }
    get().updateItem('partners', partnerId, (x) => ({ ...x, changeRequests: [req, ...(x.changeRequests || [])] }))
    const summary = Object.entries(changes).map(([k, v]) => `${k}: ${v.from || '—'} → ${v.to}`).join('\n')
    get().notify({ title: 'Profile change requested', body: `${p?.name}: ${Object.keys(changes).join(', ')}`, link: '/erp/sales/dealers', roles: ['SALES_MANAGER'], userIds: p?.salespersonId ? [p.salespersonId] : [] })
    const sp = get().users.find((u) => u.id === p?.salespersonId)
    get().sendEmail({ to: sp?.email || 'sales@btali.in', cc: 'priya@btali.in', subject: `Profile change request – ${p?.name}`, body: `${p?.name} (${p?.code}) requested the following changes:\n\n${summary}\n\n${note ? `Note: ${note}\n\n` : ''}Please verify and update the dealer master.`, ref: p?.code })
    return req
  },

  // ------------------------------------------------------------ POS sessions
  openPosSession: (partnerId, { openingCash = 0, note = '' } = {}) => {
    const open = (get().posSessions || []).find((s) => s.partnerId === partnerId && s.status === 'OPEN')
    if (open) return open
    const p = get().partners.find((x) => x.id === partnerId)
    const n = (get().posSessions || []).filter((s) => s.partnerId === partnerId).length + 1
    const s = { id: uid('ps'), number: `SES-${(p?.code || partnerId).replace('FRN-', 'F')}-${String(100 + n).padStart(3, '0')}`, partnerId, openedAt: nowISO(), openedBy: get().session.userId, openingCash: Number(openingCash) || 0, status: 'OPEN', closedAt: null, expectedCash: null, countedCash: null, variance: null, note }
    set((st) => ({ posSessions: [s, ...(st.posSessions || [])] }))
    get().audit('Opened POS session', 'POS', s.number)
    return s
  },
  /** expected cash = opening + cash collected in session */
  posSessionSummary: (sessionId) => {
    const s = (get().posSessions || []).find((x) => x.id === sessionId)
    const orders = (get().posOrders || []).filter((o) => o.sessionId === sessionId)
    const by = (m) => round2(sum(orders, (o) => sum((o.payments || []).filter((p) => p.method === m), (p) => p.amount)))
    const cash = by('CASH')
    return { orders, bills: orders.length, total: round2(sum(orders, (o) => o.total)), cash, upi: by('UPI'), card: by('CARD'), credit: by('CREDIT'), expectedCash: round2((s?.openingCash || 0) + cash) }
  },
  closePosSession: (sessionId, { countedCash, denominations = null, note = '' }) => {
    const s = (get().posSessions || []).find((x) => x.id === sessionId)
    if (!s || s.status !== 'OPEN') return { ok: false, error: 'Session is not open.' }
    const sm = get().posSessionSummary(sessionId)
    const counted = round2(countedCash)
    const variance = round2(counted - sm.expectedCash)
    const patch = { status: 'CLOSED', closedAt: nowISO(), closedBy: get().session.userId, countedCash: counted, expectedCash: sm.expectedCash, variance, denominations, note, salesTotal: sm.total, bills: sm.bills }
    get().updateItem('posSessions', sessionId, patch)
    const p = get().partners.find((x) => x.id === s.partnerId)
    if (Math.abs(variance) >= 1) get().notify({ title: `Cash variance at ${p?.city || 'store'}`, body: `${s.number}: ${variance > 0 ? 'excess' : 'short'} ${fmtINR(Math.abs(variance))}${note ? ` – ${note}` : ''}`, type: 'warning', link: '/erp/franchise', roles: ['ACCOUNTS', 'SALES_MANAGER'] })
    get().notify({ title: 'Store day closed', body: `${p?.name}: ${sm.bills} bills · ${fmtINR(sm.total)}`, link: '/erp/franchise', roles: ['SALES_MANAGER'] })
    get().audit('Closed POS session', 'POS', s.number)
    return { ok: true, session: { ...s, ...patch } }
  },

  // ------------------------------------------------------------ inward at store / dealer
  acknowledgeInward: (invoiceId, { scanned = [], lines = [], remarks = '', attachments = [] }) => {
    const inv = get().invoices.find((x) => x.id === invoiceId)
    if (!inv) return { ok: false, error: 'Invoice not found' }
    const p = get().partners.find((x) => x.id === inv.partnerId)
    const issues = lines.filter((l) => (l.expected - l.received) > 0 || l.damaged > 0)
    const inward = { acknowledged: true, date: today(), ackAt: nowISO(), by: get().session.userId, scanned, lines, remarks, attachments, ticketIds: [] }
    if (scanned.length) get().updateUnits(scanned, { status: 'AT_PARTNER', partnerId: inv.partnerId, locationId: inv.partnerId }, `Inward scanned at ${p?.name}`, inv.number)
    // stock was added at dispatch – remove what did not arrive in sellable condition
    for (const l of issues) {
      const loss = Math.max(0, l.expected - l.received) + (l.damaged || 0)
      if (loss) get().adjustPartnerStock(inv.partnerId, l.productId, -loss)
    }
    const source = p?.type === 'FRANCHISE' ? 'FRANCHISE' : 'DEALER'
    const short = issues.filter((l) => l.expected - l.received > 0)
    const damaged = issues.filter((l) => l.damaged > 0)
    const pname = (id) => get().products.find((x) => x.id === id)?.shortName || id
    if (short.length) {
      const t = get().createTicket({ source, category: 'SHORTAGE', subject: `Short receipt against ${inv.number}`, description: short.map((l) => `${pname(l.productId)}: invoiced ${l.expected}, received ${l.received}`).join('\n') + (remarks ? `\n\n${remarks}` : ''), partnerId: inv.partnerId, orderRef: inv.number, priority: 'HIGH', attachments })
      inward.ticketIds.push(t.id)
    }
    if (damaged.length) {
      const t = get().createTicket({ source, category: 'DAMAGE_IN_TRANSIT', subject: `Damaged in transit – ${inv.number}`, description: damaged.map((l) => `${pname(l.productId)}: ${l.damaged} damaged`).join('\n') + (remarks ? `\n\n${remarks}` : ''), partnerId: inv.partnerId, orderRef: inv.number, priority: 'HIGH', attachments })
      inward.ticketIds.push(t.id)
    }
    set((st) => ({
      invoices: st.invoices.map((x) => (x.id === invoiceId ? { ...x, inward } : x)),
      salesOrders: st.salesOrders.map((x) => (x.id === inv.soId ? { ...x, status: x.status === 'DISPATCHED' ? 'DELIVERED' : x.status, timeline: [...(x.timeline || []), { ts: nowISO(), text: `Goods received at ${p?.name}${issues.length ? ` – ${issues.length} line(s) with shortage/damage reported` : ' – all items OK'}` }] } : x)),
    }))
    get().notify({ title: issues.length ? 'Inward with discrepancy' : 'Goods received by partner', body: `${inv.number} · ${p?.name}${issues.length ? ` · ${issues.length} issue(s)` : ''}`, type: issues.length ? 'warning' : 'info', link: issues.length ? '/erp/service/tickets' : '/erp/dispatch/lr', roles: ['DISPATCH', 'SALES_MANAGER', ...(issues.length ? ['SERVICE'] : [])] })
    get().audit('Acknowledged inward', 'Invoice', inv.number)
    return { ok: true, inward }
  },

  // ------------------------------------------------------------ franchise replenishment
  requestReplenishment: ({ partnerId, lines, note = '', auto = false }) => {
    const clean = (lines || []).filter((l) => l.productId && Number(l.qty) > 0).map((l) => ({ productId: l.productId, qty: Number(l.qty) }))
    if (!clean.length) return { ok: false, error: 'Add at least one item.' }
    const number = get().nextNo('REP')
    const p = get().partners.find((x) => x.id === partnerId)
    const r = { id: uid('rp'), number, partnerId, date: today(), createdAt: nowISO(), auto, lines: clean, status: 'REQUESTED', soId: null, note, requestedBy: get().session.userId, history: [{ ts: nowISO(), text: auto ? 'Raised from replenishment suggestions' : 'Requested by store' }] }
    set((s) => ({ replenishments: [r, ...(s.replenishments || [])] }))
    get().notify({ title: 'Replenishment request', body: `${number} · ${p?.name} · ${clean.length} item(s)`, link: '/erp/franchise', roles: ['SALES_MANAGER', 'ADMIN'] })
    get().audit('Requested replenishment', 'Replenishment', number)
    return { ok: true, replenishment: r }
  },
  cancelReplenishment: (id) => {
    const r = (get().replenishments || []).find((x) => x.id === id)
    if (!r || r.status !== 'REQUESTED') return
    get().updateItem('replenishments', id, (x) => ({ ...x, status: 'CANCELLED', history: [...(x.history || []), { ts: nowISO(), text: 'Withdrawn by store' }] }))
  },
  /** Approval contract (id, approved, remark). Approved → sales order for the store, status ORDERED. */
  approveReplenishment: (id, approved = true, remark = '') => {
    const r = (get().replenishments || []).find((x) => x.id === id)
    if (!r || r.status !== 'REQUESTED') return null
    const p = get().partners.find((x) => x.id === r.partnerId)
    if (!approved) {
      get().updateItem('replenishments', id, (x) => ({ ...x, status: 'REJECTED', remark, decidedAt: nowISO(), decidedBy: get().session.userId, history: [...(x.history || []), { ts: nowISO(), text: `Rejected – ${remark}` }] }))
      get().notify({ title: 'Replenishment not approved', body: `${r.number}: ${remark}`, type: 'warning', partnerId: r.partnerId, link: '/franchise/replenishment' })
      get().audit('Rejected replenishment', 'Replenishment', r.number)
      return null
    }
    const so = get().createSalesOrder({ partnerId: r.partnerId, lines: r.lines, source: 'SALES', note: `Replenishment ${r.number}${remark ? ` – ${remark}` : ''}` })
    get().updateItem('replenishments', id, (x) => ({ ...x, status: 'ORDERED', soId: so.id, remark, decidedAt: nowISO(), decidedBy: get().session.userId, history: [...(x.history || []), { ts: nowISO(), text: `Approved – sales order ${so.number} created` }] }))
    get().notify({ title: 'Replenishment approved', body: `${r.number} → ${so.number} · ${fmtINR(so.total)}`, partnerId: r.partnerId, link: '/franchise/orders' })
    get().audit('Approved replenishment', 'Replenishment', r.number)
    return so
  },

  // ------------------------------------------------------------ misc
  /** emails a document copy to the partner (used for invoice / statement re-send) */
  emailPartnerDocument: (partnerId, { subject, body, fileName, ref }) => {
    const p = get().partners.find((x) => x.id === partnerId)
    return get().sendEmail({ to: p?.email, subject, body, attachments: fileName ? [makeAttachment(fileName)] : [], ref })
  },
})
